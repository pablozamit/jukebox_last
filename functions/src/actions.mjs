import { createHash, randomUUID } from 'node:crypto';
import { active, assert, assertCatalogItem, assertType, assertZone, CATALOG_BY_ID, fail, id, initialSocial, INVITATION_TTL_MS, leaseEnd, level, MAX_OUTGOING, moveBucket, sameBuckets, publicName, refs, requestId, requireAuth, SEND_COOLDOWN_MS, STARTER_IDS, unknownLegacy, allowedLegacy, validateActionInput } from './core.mjs';

const value = s => s.exists ? s.data() : null;
const present = (s, now) => active(value(s), now);
const invitationRef = (db, idValue) => db.doc(`socialInvitations/${idValue}`);
const pending = (data, now) => data?.status === 'pending' && data.expiresAt > now;

async function initialize(db, uid, now, authInfo) {
  const r = refs(db, uid);
  const legacy = r.operation('legacy-achievements-v1');
  const doc = await db.runTransaction(async tx => {
    const [userS, socialS, statsS, legacyS, ...inventory] = await Promise.all([
      tx.get(r.user), tx.get(r.social), tx.get(r.stats), tx.get(legacy),
      ...STARTER_IDS.map(itemId => tx.get(r.inventory(itemId))),
      ...Object.values(CATALOG_BY_ID).filter(item => item.achievement).map(item => tx.get(r.inventory(item.id))),
    ]);
    assert(userS.exists, 'failed-precondition', 'Create jukebox profile first');
    const user = userS.data();
    assert(user.isRegistered === true && user.email === authInfo.token?.email, 'permission-denied', 'Registered profile required');
    const social = socialS.exists ? socialS.data() : initialSocial(now);
    if (!socialS.exists) tx.create(r.social, social);
    const grants = !legacyS.exists ? allowedLegacy(user.achievements) : [];
    const existingGrants = statsS.data()?.achievementGrants || {};
    const grantRecords = Object.fromEntries(grants.filter(key => !existingGrants[key]).map(key => [key, { at: now, sourceId: 'legacy-achievements-v1', version: 1 }]));
    if (!statsS.exists) tx.create(r.stats, { schemaVersion: 1, trackingStartedAt: now, uniqueVotes: 0, uniqueProposals: 0, proposalsPlayed: 0, participationNights: 0, lastParticipationSession: null, votingStreak: 0, achievementGrants: grantRecords, updatedAt: now });
    else if (Object.keys(grantRecords).length) tx.set(r.stats, { achievementGrants: { ...existingGrants, ...grantRecords }, updatedAt: now }, { merge: true });
    STARTER_IDS.forEach((itemId, i) => { if (!inventory[i].exists) tx.create(r.inventory(itemId), { itemId, source: 'starter', grantedAt: now }); });
    if (!legacyS.exists) {
      const rewarded = Object.values(CATALOG_BY_ID).filter(item => item.achievement);
      rewarded.forEach((item, i) => { if (grants.includes(item.achievement) && !inventory[STARTER_IDS.length + i].exists) tx.create(r.inventory(item.id), { itemId: item.id, source: 'legacy-server-profile', achievement: item.achievement, grantedAt: now }); });
      tx.create(legacy, { kind: 'legacy-achievements-v1', granted: grants, unknown: unknownLegacy(user.achievements), createdAt: now });
    }
    return social;
  });
  return { profile: doc };
}

async function favorite(db, uid, songId) {
  assert(songId === null || (typeof songId === 'string' && songId.length > 0 && songId.length <= 512), 'invalid-argument', 'Invalid song ID');
  const catalogS = await db.doc('catalog/full_list').get();
  const song = songId === null ? null : (catalogS.data()?.songs || []).find(x => x.id === songId && x.available !== false);
  assert(songId === null || !!song, 'invalid-argument', 'Song unavailable');
  const favoriteSong = song ? { id: songId, title: String(song.title).slice(0, 240) } : null;
  const r = refs(db, uid);
  await db.runTransaction(async tx => {
    const social = await tx.get(r.social);
    assert(social.exists, 'failed-precondition', 'Initialize social profile');
    tx.update(r.social, { favoriteSong });
  });
  return { profile: (await r.social.get()).data() };
}

async function changePresence(db, uid, action, payload, now) {
  const r = refs(db, uid);
  const result = await db.runTransaction(async tx => {
    const [socialS, userS, roomS, presenceS] = await Promise.all([tx.get(r.social), tx.get(r.user), tx.get(r.room), tx.get(r.presence)]);
    assert(socialS.exists && userS.exists, 'failed-precondition', 'Initialize social profile');
    const social = socialS.data();
    const previous = value(presenceS);
    if (action === 'heartbeat') {
      assert(id(payload.version) && social.version === payload.version && present(presenceS, now), 'failed-precondition', 'Presence expired or replaced');
    }
    if (action === 'show') assertZone(payload.zone);
    const version = action === 'show' ? randomUUID() : action === 'hide' ? randomUUID() : social.version;
    const next = action === 'hide' ? null : {
      uid, name: publicName(userS.data()), zone: action === 'show' ? payload.zone : social.zone,
      equipped: social.equipped, version, visible: true, startedAt: action === 'show' ? now : (previous.startedAt || now),
      expiresAt: leaseEnd(now),
      ...(action === 'heartbeat' && previous.activity?.expiresAt > now ? { activity: previous.activity } : {}),
    };
    const buckets = moveBucket(value(roomS), previous, next, now);
    if (!roomS.exists) tx.set(r.room, { buckets, updatedAt: now });
    else if (!sameBuckets(value(roomS)?.buckets || {}, buckets)) tx.update(r.room, { buckets, updatedAt: now });
    // A heartbeat only renews the lease. Avoid rewriting an unchanged profile,
    // which otherwise wakes its listener every minute.
    if (action !== 'heartbeat') tx.update(r.social, { visible: action !== 'hide', zone: action === 'hide' ? null : next.zone, version });
    if (next) tx.set(r.presence, next);
    else tx.delete(r.presence);
    return { presence: next, invalidatedVersion: social.version };
  });
  if (action === 'hide' || action === 'show') await closePendingForUid(db, uid, now, null, result.invalidatedVersion);
  return result.presence ? { presence: result.presence } : {};
}

async function closePendingForUid(db, uid, now, otherUid = null, invalidatedVersion = null) {
  const col = db.collection('socialInvitations');
  const [sent, received] = await Promise.all([
    col.where('senderId', '==', uid).where('status', '==', 'pending').get(),
    col.where('recipientId', '==', uid).where('status', '==', 'pending').get(),
  ]);
  for (const doc of new Map([...sent.docs, ...received.docs].map(d => [d.id, d])).values()) {
    if (otherUid && doc.data().senderId !== otherUid && doc.data().recipientId !== otherUid) continue;
    await db.runTransaction(async tx => {
      const s = await tx.get(doc.ref);
      if (!s.exists || s.data().status !== 'pending') return;
      const data = s.data();
      const invitationVersion = data.senderId === uid ? data.senderVersion : data.recipientVersion;
      if (invalidatedVersion && invitationVersion !== invalidatedVersion) return;
      tx.update(doc.ref, { status: 'cancelled', closedAt: now, closeReason: 'presence-or-block' });
    });
  }
}

async function card(db, uid, now, auth) {
  requireAuth(auth, false);
  assert(id(uid), 'invalid-argument', 'Invalid user ID');
  const r = refs(db, uid);
  let accountSince = null;
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const created = (await getAuth().getUser(uid)).metadata.creationTime;
    accountSince = created ? Date.parse(created) : null;
  } catch { /* Older Auth records may be unavailable during local tests. */ }
  return db.runTransaction(async tx => {
    const [presenceS, socialS, userS, statsS] = await Promise.all([tx.get(r.presence), tx.get(r.social), tx.get(r.user), tx.get(r.stats)]);
    assert(present(presenceS, now), 'not-found', 'Person is not visible');
    const p = presenceS.data(); const social = socialS.data() || {}; const user = userS.data() || {}; const stats = statsS.data() || {};
    const since = accountSince || (Number.isFinite(user.createdAt) ? user.createdAt : null);
    return { card: { uid, name: p.name, zone: p.zone, equipped: p.equipped, favoriteSong: social.favoriteSong || null,
      level: level(user.totalPointsEarned), accountSince: since, accountSinceLabel: since ? 'account' : null,
      trackingStartedAt: stats.trackingStartedAt || null,
      stats: { uniqueVotes: stats.uniqueVotes || 0, uniqueProposals: stats.uniqueProposals || 0, proposalsPlayed: stats.proposalsPlayed || 0, participationNights: stats.participationNights || 0 },
      achievements: Object.keys(stats.achievementGrants || {}),
    } };
  });
}

async function preferences(db, uid, muteInvites) {
  assert(typeof muteInvites === 'boolean', 'invalid-argument', 'Expected boolean');
  const r = refs(db, uid);
  await r.social.update({ muteInvites });
  return { profile: (await r.social.get()).data() };
}

async function block(db, uid, otherUid, now, unblock = false) {
  assert(id(otherUid) && otherUid !== uid, 'invalid-argument', 'Invalid person');
  const r = refs(db, uid);
  if (unblock) await r.block(otherUid).delete();
  else { await r.block(otherUid).set({ blockedAt: now }); await closePendingForUid(db, uid, now, otherUid); }
  return {};
}

async function buy(db, uid, itemId, opId, now) {
  const item = assertCatalogItem(itemId);
  assert(item.source === 'shop' && Number.isInteger(item.price) && item.price > 0, 'invalid-argument', 'Not for sale');
  assert(requestId(opId), 'invalid-argument', 'Invalid request ID');
  const r = refs(db, uid), op = r.operation(opId), inv = r.inventory(itemId);
  return db.runTransaction(async tx => {
    const [opS, userS, socialS, invS, catalogS] = await Promise.all([tx.get(op), tx.get(r.user), tx.get(r.social), tx.get(inv), tx.get(db.doc(`socialCatalog/${itemId}`))]);
    if (opS.exists) {
      assert(opS.data().kind === 'buy' && opS.data().itemId === itemId, 'already-exists', 'Request ID used for another operation');
      return opS.data().result;
    }
    assert(socialS.exists && userS.exists, 'failed-precondition', 'Initialize social profile');
    assert(catalogS.exists && catalogS.data().active === true && catalogS.data().source === 'shop' && catalogS.data().price === item.price && catalogS.data().category === item.category, 'failed-precondition', 'Catalog is not ready');
    assert(!invS.exists, 'already-exists', 'Item already owned');
    const points = userS.data().points;
    assert(Number.isInteger(points) && points >= item.price, 'failed-precondition', 'Insufficient points');
    const result = { itemId, points: points - item.price };
    tx.update(r.user, { points: result.points });
    tx.create(inv, { itemId, source: 'shop', price: item.price, grantedAt: now });
    tx.create(op, { kind: 'buy', itemId, result, createdAt: now });
    return result;
  });
}

async function equip(db, uid, itemId, now) {
  const item = assertCatalogItem(itemId);
  const r = refs(db, uid);
  return db.runTransaction(async tx => {
    const [socialS, invS, presenceS] = await Promise.all([tx.get(r.social), tx.get(r.inventory(itemId)), tx.get(r.presence)]);
    assert(socialS.exists, 'failed-precondition', 'Initialize social profile');
    assert(invS.exists, 'permission-denied', 'Item not owned');
    const equipped = { ...socialS.data().equipped, [item.category]: itemId };
    tx.update(r.social, { equipped });
    if (present(presenceS, now)) tx.update(r.presence, { equipped });
    return { profile: { ...socialS.data(), equipped } };
  });
}

async function invite(db, uid, { recipientId, type, requestId: opId }, now) {
  assert(id(recipientId) && recipientId !== uid, 'invalid-argument', 'Invalid recipient');
  assertType(type);
  assert(requestId(opId), 'invalid-argument', 'Invalid request ID');
  const sender = refs(db, uid), recipient = refs(db, recipientId);
  const op = sender.operation(opId), invitation = db.collection('socialInvitations').doc();
  const pairId = createHash('sha256').update(JSON.stringify([uid, recipientId].sort())).digest('hex');
  const pair = db.doc(`socialPairs/${pairId}`);
  return db.runTransaction(async tx => {
    const outgoing = await tx.get(db.collection('socialInvitations').where('senderId', '==', uid).where('status', '==', 'pending').limit(50));
    const [opS, senderS, recipientS, senderP, recipientP, forwardBlock, reverseBlock, userS, pairS] = await Promise.all([
      tx.get(op), tx.get(sender.social), tx.get(recipient.social), tx.get(sender.presence), tx.get(recipient.presence),
      tx.get(sender.block(recipientId)), tx.get(recipient.block(uid)), tx.get(sender.user), tx.get(pair),
    ]);
    if (opS.exists) {
      assert(opS.data().kind === 'invite' && opS.data().recipientId === recipientId && opS.data().type === type, 'already-exists', 'Request ID used for another operation');
      return opS.data().result;
    }
    assert(senderS.exists && recipientS.exists && present(senderP, now) && present(recipientP, now), 'failed-precondition', 'Both people must be visible');
    assert(!forwardBlock.exists && !reverseBlock.exists && !recipientS.data().muteInvites, 'permission-denied', 'Invitations unavailable');
    if (pairS.exists && pairS.data().expiresAt > now) {
      const prior = await tx.get(invitationRef(db, pairS.data().invitationId));
      assert(!prior.exists || !pending(prior.data(), now), 'already-exists', 'Pending invitation between these people');
    }
    const activeOutgoing = outgoing.docs.filter(d => pending(d.data(), now));
    assert(activeOutgoing.length < MAX_OUTGOING, 'resource-exhausted', 'Too many pending invitations');
    assert(!activeOutgoing.some(d => d.data().recipientId === recipientId), 'already-exists', 'Pending invitation to this person');
    assert(now - (senderS.data().lastInviteAt || 0) >= SEND_COOLDOWN_MS, 'resource-exhausted', 'Wait before another invitation');
    const doc = { senderId: uid, recipientId, type, status: 'pending', senderName: publicName(userS.data()), recipientName: recipientP.data().name,
      senderVersion: senderP.data().version, recipientVersion: recipientP.data().version,
      createdAt: now, expiresAt: now + INVITATION_TTL_MS };
    const result = { invitation: { id: invitation.id, ...doc } };
    tx.create(invitation, doc);
    tx.set(pair, { invitationId: invitation.id, expiresAt: doc.expiresAt, updatedAt: now });
    tx.update(sender.social, { lastInviteAt: now });
    tx.create(op, { kind: 'invite', recipientId, type, result, createdAt: now });
    return result;
  });
}

async function respond(db, uid, { id: invitationId, response }, now) {
  assert(id(invitationId) && ['accepted', 'declined'].includes(response), 'invalid-argument', 'Invalid response');
  const inv = invitationRef(db, invitationId);
  return db.runTransaction(async tx => {
    const invS = await tx.get(inv);
    assert(invS.exists, 'not-found', 'Invitation not found');
    const data = invS.data();
    assert(data.recipientId === uid, 'permission-denied', 'Only recipient may respond');
    if (data.status === response) return { invitation: { id: invitationId, ...data } };
    assert(data.status === 'pending', 'failed-precondition', 'Invitation already closed');
    if (data.expiresAt <= now) {
      tx.update(inv, { status: 'expired', closedAt: now });
      return { invitation: { id: invitationId, ...data, status: 'expired', closedAt: now } };
    }
    if (response === 'declined') {
      tx.update(inv, { status: 'declined', closedAt: now });
      return { invitation: { id: invitationId, ...data, status: 'declined', closedAt: now } };
    }
    const sender = refs(db, data.senderId), recipient = refs(db, uid);
    const [senderP, recipientP, forwardBlock, reverseBlock, recipientS] = await Promise.all([
      tx.get(sender.presence), tx.get(recipient.presence), tx.get(sender.block(uid)), tx.get(recipient.block(data.senderId)), tx.get(recipient.social),
    ]);
    assert(present(senderP, now) && present(recipientP, now) && senderP.data().version === data.senderVersion && recipientP.data().version === data.recipientVersion, 'failed-precondition', 'Presence changed');
    assert(!forwardBlock.exists && !reverseBlock.exists && !recipientS.data().muteInvites, 'permission-denied', 'Invitation unavailable');
    const zones = response === 'accepted' ? { senderZone: senderP.data().zone, recipientZone: recipientP.data().zone } : {};
    const updated = { ...data, status: response, closedAt: now, ...zones };
    tx.update(inv, { status: response, closedAt: now, ...zones });
    return { invitation: { id: invitationId, ...updated } };
  });
}

async function cancel(db, uid, { id: invitationId }, now) {
  assert(id(invitationId), 'invalid-argument', 'Invalid invitation ID');
  const inv = invitationRef(db, invitationId);
  return db.runTransaction(async tx => {
    const s = await tx.get(inv);
    assert(s.exists, 'not-found', 'Invitation not found');
    const data = s.data();
    assert(data.senderId === uid, 'permission-denied', 'Only sender may cancel');
    if (data.status === 'cancelled') return { invitation: { id: invitationId, ...data } };
    assert(data.status === 'pending', 'failed-precondition', 'Invitation already closed');
    if (data.expiresAt <= now) {
      tx.update(inv, { status: 'expired', closedAt: now });
      return { invitation: { id: invitationId, ...data, status: 'expired', closedAt: now } };
    }
    tx.update(inv, { status: 'cancelled', closedAt: now });
    return { invitation: { id: invitationId, ...data, status: 'cancelled', closedAt: now } };
  });
}

export async function executeAction(db, auth, data, now = Date.now()) {
  assert(data && typeof data === 'object' && !Array.isArray(data), 'invalid-argument', 'Expected action object');
  const { action, ...payload } = data;
  validateActionInput(action, payload);
  const uid = requireAuth(auth, action !== 'card');
  if (action === 'card') return card(db, payload.uid, now, auth);
  if (action === 'initialize') return initialize(db, uid, now, auth);
  if (action === 'show' || action === 'hide' || action === 'heartbeat') return changePresence(db, uid, action, payload, now);
  if (action === 'favorite') return favorite(db, uid, payload.songId);
  if (action === 'preferences') return preferences(db, uid, payload.muteInvites);
  if (action === 'block' || action === 'unblock') return block(db, uid, payload.uid, now, action === 'unblock');
  if (action === 'buy') return buy(db, uid, payload.itemId, payload.requestId, now);
  if (action === 'equip') return equip(db, uid, payload.itemId, now);
  if (action === 'invite') return invite(db, uid, payload, now);
  if (action === 'respond') return respond(db, uid, payload, now);
  if (action === 'cancel') return cancel(db, uid, payload, now);
  fail('invalid-argument', 'Unknown action');
}
