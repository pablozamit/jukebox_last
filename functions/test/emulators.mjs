import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, collectionGroup, query, where, orderBy, getDocs } from 'firebase/firestore';
import { SOCIAL_CATALOG } from '../src/generated/socialCatalog.mjs';
import { visibleCount } from '../src/generated/socialCatalog.mjs';
import { executeAction } from '../src/actions.mjs';
import { eventId, processEvent, reconcilePresence } from '../src/events.mjs';
import { cleanupFixtureUsers, restoreDocument } from './fixtureCleanup.mjs';

if (process.env.GCLOUD_PROJECT !== 'demo-catrina-social' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST) {
  throw new Error('Emulator test requires demo-catrina-social plus Auth, Firestore and Functions emulators');
}
const app = initializeApp({ projectId: 'demo-catrina-social' }, `social-test-${Date.now()}`);
const db = getFirestore(app);
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-catrina-social', firestore: { host, port: Number(port), rules } });
const auth = uid => ({ uid, token: { email: `${uid}@example.test`, firebase: { sign_in_provider: 'password' } } });
const now = Date.now();
const run = Date.now().toString(36);
const alice = `test-alice-${run}`, bob = `test-bob-${run}`, stranger = `test-stranger-${run}`;
const fixtureUids = [alice, bob, stranger];
const musicCatalog = db.doc('catalog/full_list');
const originalMusicCatalog = await musicCatalog.get();
const originalSocialCatalog = new Map();
for (const item of SOCIAL_CATALOG) originalSocialCatalog.set(item.id, await db.doc(`socialCatalog/${item.id}`).get());
let checks = 0;
const pass = label => { checks++; console.log(`ok ${checks} - ${label}`); };
const assertExactRoomCount = at => db.runTransaction(async tx => {
  const room = await tx.get(db.doc('rooms/catrina'));
  const presences = await tx.get(db.collection('rooms/catrina/presence'));
  const actual = presences.docs.filter(doc => doc.data().visible && doc.data().expiresAt > at).length;
  assert.equal(visibleCount(room.data()?.buckets || {}, at), actual);
});
try {
  for (const uid of [alice, bob, stranger]) {
    await db.doc(`users/${uid}`).set({ isRegistered: true, email: `${uid}@example.test`, djName: uid, proposals: [], votes: [], points: 200, totalPointsEarned: 300, achievements: uid === alice ? ['first_vote', 'unknown'] : [] });
  }
  await db.doc('catalog/full_list').set({ songs: [{ id: 'song-1', title: 'Demo Song', available: true }, { id: 'Niña del Mar.mp4', title: 'Niña del Mar', available: true }] });
  for (const item of SOCIAL_CATALOG) await db.doc(`socialCatalog/${item.id}`).set(item);
  await Promise.all([executeAction(db, auth(alice), { action: 'initialize' }, now), executeAction(db, auth(alice), { action: 'initialize' }, now)]);
  await executeAction(db, auth(bob), { action: 'initialize' }, now);
  assert.equal((await db.doc(`socialUsers/${alice}/inventory/bracelet-music`).get()).exists, true);
  assert.deepEqual((await db.doc(`socialUsers/${alice}/operations/legacy-achievements-v1`).get()).data().unknown, ['unknown']);
  pass('Concurrent initialization grants legacy reward exactly once');
  assert.equal((await executeAction(db, auth(alice), { action: 'favorite', songId: 'Niña del Mar.mp4' }, now)).profile.favoriteSong.title, 'Niña del Mar');
  pass('Favorite accepts exact catalog IDs with spaces and accents');

  const a = env.authenticatedContext(alice).firestore(), b = env.authenticatedContext(bob).firestore();
  const guest = env.authenticatedContext('anonymous-guest', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertSucceeds(getDoc(doc(a, `socialUsers/${alice}`)));
  await assertFails(getDoc(doc(b, `socialUsers/${alice}`)));
  await assertFails(setDoc(doc(a, `socialUsers/${alice}/inventory/fake`), { itemId: 'fake' }));
  await assertFails(setDoc(doc(a, `socialStats/${alice}`), { uniqueVotes: 999 }));
  await assertFails(setDoc(doc(a, `socialEvents/fake`), { kind: 'vote' }));
  await assertSucceeds(getDoc(doc(guest, 'rooms/catrina')));
  pass('Rules protect private social data and reject direct writes');
  await db.doc(`songs/song-1/voteEvents/ticker-${run}`).set({ kind: 'vote_event', userId: alice, songId: 'song-1', title: 'Demo Song', type: 'vote', voterName: 'Alba', ts: now });
  await assertSucceeds(getDocs(query(collectionGroup(a, 'voteEvents'), where('kind', '==', 'vote_event'))));
  await assertFails(getDocs(collectionGroup(a, 'voteEvents')));
  pass('Existing vote ticker collection-group query remains readable only for vote_event');

  const first = await executeAction(db, auth(alice), { action: 'show', zone: 'bar' }, now);
  const second = await executeAction(db, auth(bob), { action: 'show', zone: 'pool' }, now);
  await assertExactRoomCount(now);
  await assertFails(setDoc(doc(guest, `rooms/catrina/presence/${alice}`), { uid: alice }));
  await assertSucceeds(getDoc(doc(guest, `rooms/catrina/presence/${alice}`)));
  await assertSucceeds(getDocs(collection(guest, 'rooms/catrina/presence')));
  await assertSucceeds(getDocs(collection(a, 'socialCatalog')));
  await assertSucceeds(getDocs(collection(a, `socialUsers/${alice}/inventory`)));
  await assertFails(getDocs(collection(b, `socialUsers/${alice}/inventory`)));
  await assert.rejects(executeAction(db, auth(alice), { action: 'heartbeat', version: 'old' }, now + 1000));
  const socialBeforeBeat = await db.doc(`socialUsers/${alice}`).get();
  const roomBeforeBeat = await db.doc('rooms/catrina').get();
  await executeAction(db, auth(alice), { action: 'heartbeat', version: first.presence.version }, now);
  assert.equal((await db.doc(`socialUsers/${alice}`).get()).updateTime.toMillis(), socialBeforeBeat.updateTime.toMillis());
  assert.equal((await db.doc('rooms/catrina').get()).updateTime.toMillis(), roomBeforeBeat.updateTime.toMillis());
  await executeAction(db, auth(alice), { action: 'heartbeat', version: first.presence.version }, now + 1000);
  pass('Presence version and room count stay authoritative');

  const card = await executeAction(db, { uid: 'anonymous-guest', token: { firebase: { sign_in_provider: 'anonymous' } } }, { action: 'card', uid: alice }, now + 1000);
  assert.equal(card.card.name, alice);
  assert.equal(JSON.stringify(card).includes('email'), false);
  assert.equal(JSON.stringify(card).includes('points'), false);
  pass('Anonymous DJ card omits private fields');

  const invite = await executeAction(db, auth(alice), { action: 'invite', recipientId: bob, type: 'pool', requestId: 'invite-0001' }, now + 2000);
  assert.equal(invite.invitation.senderName, alice);
  assert.equal(invite.invitation.recipientName, bob);
  assert.equal((await executeAction(db, auth(alice), { action: 'invite', recipientId: bob, type: 'pool', requestId: 'invite-0001' }, now + 2000)).invitation.id, invite.invitation.id);
  await assert.rejects(executeAction(db, auth(bob), { action: 'invite', recipientId: alice, type: 'drink', requestId: 'invite-reverse-0001' }, now + 2500));
  await assert.rejects(executeAction(db, auth(stranger), { action: 'respond', id: invite.invitation.id, response: 'accepted' }, now + 3000));
  const senderQuery = query(collection(a, 'socialInvitations'), where('senderId', '==', alice), orderBy('createdAt', 'desc'));
  const recipientQuery = query(collection(b, 'socialInvitations'), where('recipientId', '==', bob), orderBy('createdAt', 'desc'));
  await assertSucceeds(getDocs(senderQuery));
  await assertSucceeds(getDocs(recipientQuery));
  await assertFails(getDocs(query(collection(a, 'socialInvitations'), where('recipientId', '==', bob), orderBy('createdAt', 'desc'))));
  await assertFails(getDoc(doc(guest, `socialInvitations/${invite.invitation.id}`)));
  await executeAction(db, auth(bob), { action: 'respond', id: invite.invitation.id, response: 'accepted' }, now + 3000);
  pass('Invitation is idempotent, participant-private and terminal');

  await executeAction(db, auth(bob), { action: 'preferences', muteInvites: true }, now + 40000);
  await assert.rejects(executeAction(db, auth(alice), { action: 'invite', recipientId: bob, type: 'drink', requestId: 'invite-0002' }, now + 40000));
  await executeAction(db, auth(bob), { action: 'preferences', muteInvites: false }, now + 40000);
  await executeAction(db, auth(bob), { action: 'block', uid: alice }, now + 40000);
  await assertSucceeds(getDocs(collection(b, `socialUsers/${bob}/blocks`)));
  await assertFails(getDocs(collection(a, `socialUsers/${bob}/blocks`)));
  await assert.rejects(executeAction(db, auth(alice), { action: 'invite', recipientId: bob, type: 'drink', requestId: 'invite-0003' }, now + 40000));
  await executeAction(db, auth(bob), { action: 'unblock', uid: alice }, now + 40000);
  const afterBlock = await executeAction(db, auth(alice), { action: 'invite', recipientId: bob, type: 'drink', requestId: 'invite-0004' }, now + 40000);
  await executeAction(db, auth(alice), { action: 'hide' }, now + 41000);
  await assert.rejects(executeAction(db, auth(bob), { action: 'respond', id: afterBlock.invitation.id, response: 'accepted' }, now + 42000));
  await executeAction(db, auth(alice), { action: 'show', zone: 'bar' }, now + 43000);
  const decline = await executeAction(db, auth(bob), { action: 'invite', recipientId: alice, type: 'pool', requestId: 'invite-decline-01' }, now + 45000);
  await executeAction(db, auth(alice), { action: 'preferences', muteInvites: true }, now + 45000);
  assert.equal((await executeAction(db, auth(alice), { action: 'respond', id: decline.invitation.id, response: 'declined' }, now + 46000)).invitation.status, 'declined');
  await executeAction(db, auth(alice), { action: 'preferences', muteInvites: false }, now + 46000);
  pass('Mute, block and hidden presence invalidate invitations');

  const purchases = await Promise.allSettled([
    executeAction(db, auth(alice), { action: 'buy', itemId: 'jacket-dj', requestId: 'buy-00001' }, now + 4000),
    executeAction(db, auth(alice), { action: 'buy', itemId: 'jacket-denim', requestId: 'buy-00002' }, now + 4000),
  ]);
  assert.equal(purchases.filter(x => x.status === 'fulfilled').length, 1);
  const winner = purchases[0].status === 'fulfilled' ? { itemId: 'jacket-dj', requestId: 'buy-00001', price: 200 } : { itemId: 'jacket-denim', requestId: 'buy-00002', price: 100 };
  const remaining = (await db.doc(`users/${alice}`).get()).data().points;
  assert.equal(remaining, 200 - winner.price);
  assert.equal((await db.doc(`users/${alice}`).get()).data().totalPointsEarned, 300);
  assert.equal((await executeAction(db, auth(alice), { action: 'buy', itemId: winner.itemId, requestId: winner.requestId }, now + 4000)).points, remaining);
  await assert.rejects(executeAction(db, auth(alice), { action: 'equip', itemId: 'boots' }, now + 44000));
  pass('Competing purchases cannot overspend, replay or equip unowned items');

  await db.doc(`users/${stranger}`).update({ points: 100, freeVotes: 0 });
  await executeAction(db, auth(stranger), { action: 'initialize' }, now + 45000);
  const c = env.authenticatedContext(stranger).firestore();
  const spendRace = await Promise.allSettled([
    executeAction(db, auth(stranger), { action: 'buy', itemId: 'jacket-denim', requestId: 'buy-vote-race' }, now + 46000),
    updateDoc(doc(c, `users/${stranger}`), { points: 50, freeVotes: 1 }),
  ]);
  assert.equal(spendRace.filter(x => x.status === 'fulfilled').length, 1);
  assert.ok((await db.doc(`users/${stranger}`).get()).data().points >= 0);
  await Promise.all([
    executeAction(db, auth(bob), { action: 'buy', itemId: 'jacket-dj', requestId: 'buy-credit-race' }, now + 46000),
    db.doc(`users/${bob}`).update({ points: FieldValue.increment(10), totalPointsEarned: FieldValue.increment(10) }),
  ]);
  assert.equal((await db.doc(`users/${bob}`).get()).data().points, 10);
  pass('Vote exchange and bridge credit interleave safely with purchases');

  const e = { schemaVersion: 1, kind: 'vote', uid: alice, songId: 'song-1', sessionId: '2026-10-17', sourceId: 'source-vote-1', occurredAt: new Date(now + 4500).toISOString(), certifiedAt: new Date(now + 4500).toISOString() };
  await processEvent(db, eventId(e), e, now + 5000);
  await processEvent(db, eventId(e), e, now + 5001);
  assert.equal((await db.doc(`socialStats/${alice}`).get()).data().uniqueVotes, 1);
  const peak = { ...e, kind: 'peak', sourceId: 'source-peak-1', peakVotes: 10 };
  await processEvent(db, eventId(peak), peak, now + 5001);
  await processEvent(db, eventId(peak), peak, now + 5002);
  assert.equal((await db.doc(`socialStats/${alice}`).get()).data().achievementGrants.influencer.sourceId, eventId(peak));
  assert.equal((await db.doc(`socialUsers/${alice}/inventory/glasses-star`).get()).data().achievement, 'influencer');
  const close = { ...e, kind: 'night_close', sourceId: 'night-close-1', peakVotes: 10 };
  await processEvent(db, eventId(close), close, now + 5003);
  await processEvent(db, eventId(close), close, now + 5004);
  assert.equal((await db.doc(`socialStats/${alice}`).get()).data().achievementGrants.hitmaker.sourceId, eventId(close));
  assert.equal((await db.doc(`socialUsers/${alice}/inventory/jacket-hits`).get()).data().achievement, 'hitmaker');
  const played = { ...e, kind: 'play', uid: bob, role: 'proposer', playbackId: 'playback-001', sourceId: 'playback-001', peakVotes: 10 };
  await processEvent(db, eventId(played), played, now + 5005);
  const bobGrants = (await db.doc(`socialStats/${bob}`).get()).data().achievementGrants;
  assert.ok(bobGrants.protagonist && bobGrants.influencer && !bobGrants.hitmaker);
  assert.equal((await db.doc(`socialUsers/${bob}/inventory/glasses-star`).get()).data().achievement, 'influencer');
  pass('Certified events grant influencer at ten votes and hitmaker at night close exactly once');

  await executeAction(db, auth(alice), { action: 'hide' }, now + 47000);
  await assert.rejects(executeAction(db, auth(alice), { action: 'heartbeat', version: first.presence.version }, now + 48000));
  await executeAction(db, auth(bob), { action: 'heartbeat', version: second.presence.version }, now + 61000);
  await assertExactRoomCount(now + 61000);
  await executeAction(db, auth(bob), { action: 'hide' }, now + 62000);
  await assertExactRoomCount(now + 62000);
  await assert.rejects(executeAction(db, auth(bob), { action: 'heartbeat', version: second.presence.version }, now + 300_000));
  if (process.argv.includes('--isolated')) {
    await executeAction(db, auth(bob), { action: 'show', zone: 'bar' }, now + 63_000);
    await reconcilePresence(db, now + 300_000);
    assert.deepEqual((await db.doc('rooms/catrina').get()).data().buckets, {});
    assert.equal((await db.doc(`rooms/catrina/presence/${bob}`).get()).exists, false);
    assert.equal((await db.doc(`socialUsers/${bob}`).get()).data().visible, false);
  }
  pass('Renewed and hidden leases replace old buckets exactly');
} finally {
  const cleanupErrors = [];
  const safe = async (label, task) => { try { await task(); } catch (error) { cleanupErrors.push(new Error(`${label}: ${error.message}`)); } };
  await safe('fixture users', () => cleanupFixtureUsers(db, fixtureUids));
  await safe('vote ticker', () => db.doc(`songs/song-1/voteEvents/ticker-${run}`).delete());
  await safe('music catalog', () => restoreDocument(musicCatalog, originalMusicCatalog));
  for (const item of SOCIAL_CATALOG) await safe(`social catalog ${item.id}`, () => restoreDocument(db.doc(`socialCatalog/${item.id}`), originalSocialCatalog.get(item.id)));
  await safe('rules environment', () => env.cleanup());
  await safe('admin app', () => deleteApp(app));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Emulator fixture cleanup failed');
}
console.log(`${checks} emulator checks passed`);
