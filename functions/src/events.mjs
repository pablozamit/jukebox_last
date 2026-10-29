import { createHash, randomUUID } from 'node:crypto';
import { active, ACTIVITY_MS, CATALOG_BY_ID, refs, ROOM, sameBuckets } from './core.mjs';

export const eventId = e => createHash('sha256').update(JSON.stringify(
  e.kind === 'play' ? [e.kind, e.playbackId, e.uid] : [e.kind, e.uid, e.songId, e.sessionId]
)).digest('hex');

export function eventValid(e, eventDocId) {
  if (!e || e.schemaVersion !== 1 || !['vote', 'proposal', 'play', 'peak', 'night_close'].includes(e.kind)) return false;
  if (typeof e.uid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(e.uid)) return false;
  if (typeof e.songId !== 'string' || !e.songId || typeof e.sessionId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.sessionId)) return false;
  if (typeof e.sourceId !== 'string' || !e.sourceId) return false;
  if (!Number.isFinite(Date.parse(e.occurredAt)) || !Number.isFinite(Date.parse(e.certifiedAt))) return false;
  if (e.kind === 'play' && (typeof e.playbackId !== 'string' || !e.playbackId || !['proposer', 'voter'].includes(e.role))) return false;
  if (e.kind === 'peak') return Number.isFinite(e.peakVotes) && e.peakVotes >= 10 && eventDocId === eventId(e);
  if (e.kind === 'night_close') return Number.isFinite(e.peakVotes) && e.peakVotes > 0 && eventDocId === eventId(e);
  return eventDocId === eventId(e);
}

export function madridHour(iso) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));
}
const dayNumber = key => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000);
export function votingStreak(sessions) {
  const days = [...new Set(sessions)].map(dayNumber).filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0, run = 0, prev;
  for (const day of days) { run = day === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = day; }
  return best;
}

export async function processEvent(db, eventDocId, e, now = Date.now()) {
  if (!eventValid(e, eventDocId)) throw new Error('Invalid certified social event');
  const uid = e.uid, r = refs(db, uid);
  const receipt = db.doc(`socialEventReceipts/${eventDocId}`);
  const played = e.kind === 'play' && e.role === 'proposer';
  const happened = Date.parse(e.occurredAt);
  return db.runTransaction(async tx => {
    const [receiptS, statsS, presenceS, socialS, userS] = await Promise.all([
      tx.get(receipt), tx.get(r.stats), tx.get(r.presence), tx.get(r.social), tx.get(r.user),
    ]);
    if (receiptS.exists) return { duplicate: true };
    const before = statsS.exists ? statsS.data() : {};
    const voteSessions = Array.isArray(before.voteSessions) ? before.voteSessions : [];
    const participationSessions = Array.isArray(before.participationSessions) ? before.participationSessions : [];
    const grants = { ...(before.achievementGrants || {}) };
    const add = key => { if (!grants[key]) grants[key] = { at: now, sourceId: eventDocId, version: 1 }; };
    if (e.kind === 'vote') {
      add('first_vote');
      if (!voteSessions.includes(e.sessionId)) voteSessions.push(e.sessionId);
      if (madridHour(e.occurredAt) === 19) add('early_bird');
      if ([0, 1].includes(madridHour(e.occurredAt))) add('night_owl');
    }
    if (played) {
      add('protagonist');
      if (Number.isFinite(e.peakVotes) && e.peakVotes >= 10) add('influencer');
    }
    if (e.kind === 'peak') add('influencer');
    if (e.kind === 'night_close') {
      add('hitmaker');
      if (e.peakVotes >= 10) add('influencer');
    }
    if (['vote', 'proposal', 'play'].includes(e.kind) && !participationSessions.includes(e.sessionId)) participationSessions.push(e.sessionId);
    if (votingStreak(voteSessions) >= 2) add('streak');
    if (participationSessions.length >= 4) add('loyal');
    const update = {
      schemaVersion: 1, trackingStartedAt: Math.min(before.trackingStartedAt || happened, happened),
      uniqueVotes: (before.uniqueVotes || 0) + Number(e.kind === 'vote'),
      uniqueProposals: (before.uniqueProposals || 0) + Number(e.kind === 'proposal'),
      proposalsPlayed: (before.proposalsPlayed || 0) + Number(played),
      participationNights: participationSessions.length,
      lastParticipationSession: participationSessions.slice().sort().at(-1) || null,
      votingStreak: votingStreak(voteSessions), voteSessions, participationSessions,
      achievementGrants: grants, updatedAt: now,
    };
    const newGrantKeys = Object.keys(grants).filter(key => !before.achievementGrants?.[key]);
    const inventoryRefs = Object.values(CATALOG_BY_ID).filter(item => newGrantKeys.includes(item.achievement)).map(item => ({ item, ref: r.inventory(item.id) }));
    const inventoryS = await Promise.all(inventoryRefs.map(v => tx.get(v.ref)));
    tx.set(r.stats, update);
    tx.create(receipt, { uid, kind: e.kind, sourceId: e.sourceId, createdAt: now });
    inventoryRefs.forEach(({ item, ref }, i) => { if (!inventoryS[i].exists) tx.create(ref, { itemId: item.id, source: 'achievement', achievement: item.achievement, grantedAt: now, sourceId: eventDocId }); });
    if (userS.exists && newGrantKeys.length) {
      const raw = userS.data().achievements;
      if (raw == null || Array.isArray(raw)) {
        const old = Array.isArray(raw) ? raw : [];
        tx.update(r.user, { achievements: [...new Set([...old, ...newGrantKeys])] });
      }
    }
    if (['vote', 'proposal', 'play'].includes(e.kind) && socialS.exists && active(presenceS.data(), now) && happened >= presenceS.data().startedAt && happened <= now && now - happened <= ACTIVITY_MS) {
      tx.update(r.presence, { activity: { id: eventDocId, kind: e.kind, expiresAt: now + ACTIVITY_MS } });
    }
    return { duplicate: false, granted: newGrantKeys };
  });
}

export async function reconcilePresence(db, now = Date.now()) {
  const room = db.doc(`rooms/${ROOM}`), col = db.collection(`rooms/${ROOM}/presence`);
  // Active leases do not need the preliminary read; they are read once below
  // when building an exact, transactionally protected room summary.
  const expired = await col.where('expiresAt', '<=', now).get();
  for (const doc of expired.docs) await db.runTransaction(async tx => {
    const social = db.doc(`socialUsers/${doc.id}`);
    const [s, profile] = await Promise.all([tx.get(doc.ref), tx.get(social)]);
    if (s.exists && !active(s.data(), now)) {
      tx.delete(doc.ref);
      if (profile.exists && profile.data().version === s.data().version) tx.update(social, { visible: false, zone: null, version: randomUUID() });
    }
  });
  // Renewals that change a bucket also write the room. Reading it first ensures
  // a concurrent bucket change retries this reconciliation rather than losing a count.
  return db.runTransaction(async tx => {
    const roomS = await tx.get(room);
    const live = await tx.get(col);
    const buckets = {};
    for (const doc of live.docs) if (active(doc.data(), now)) {
      const key = String(doc.data().expiresAt);
      buckets[key] = (buckets[key] || 0) + 1;
    }
    if (!roomS.exists) tx.set(room, { buckets, updatedAt: now, reconciledAt: now });
    else if (!sameBuckets(roomS.data()?.buckets || {}, buckets)) tx.update(room, { buckets, updatedAt: now, reconciledAt: now });
    return buckets;
  });
}

export async function expireInvitations(db, now = Date.now()) {
  const pending = await db.collection('socialInvitations').where('status', '==', 'pending').where('expiresAt', '<=', now).limit(200).get();
  for (const doc of pending.docs) await db.runTransaction(async tx => {
    const s = await tx.get(doc.ref);
    if (s.exists && s.data().status === 'pending' && s.data().expiresAt <= now) tx.update(doc.ref, { status: 'expired', closedAt: now });
  });
  return pending.size;
}
