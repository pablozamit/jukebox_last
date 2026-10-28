import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import test, { before, after } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, collectionGroup, doc, getDoc, getDocs, increment, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';

// Only an explicit loopback emulator can receive these synthetic fixtures.
const hostValue = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const match = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(hostValue);
if (!match) throw new Error('Compatibility tests require a loopback Firestore emulator');
const host = match[1];
const port = Number(match[2]);
const runId = Date.now().toString(36);
const baselineRevision = 'd333643d05700ef040f66df624d4e33b12a120e4';
const root = new URL('../../', import.meta.url);
const environments = {};
let sequence = 0;
const denied = error => error.code === 'permission-denied';

before(async () => {
  const rules = {
    old: execFileSync('git', ['show', `${baselineRevision}:firestore.rules`], { cwd: root, encoding: 'utf8' }),
    compat: await fs.readFile(new URL('../../firestore.compat.rules', import.meta.url), 'utf8'),
    strict: await fs.readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  };
  for (const [lane, source] of Object.entries(rules)) {
    environments[lane] = await initializeTestEnvironment({
      projectId: `demo-rollout-${runId}-${lane}`,
      firestore: { host, port, rules: source },
    });
  }
});

after(async () => {
  for (const environment of Object.values(environments)) {
    await environment.clearFirestore();
    await environment.cleanup();
  }
});

async function createUser(lane, extra = {}) {
  const uid = `fixture-${++sequence}`;
  const email = `${uid}@example.test`;
  const db = environments[lane].authenticatedContext(uid, { email }).firestore();
  await setDoc(doc(db, 'users', uid), { proposals: [], votes: [], ...extra });
  return { lane, uid, email, db };
}

async function seed(lane, path, data) {
  await environments[lane].withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), data));
}

// Legacy writes mirror main's transaction: both arrays are submitted, the song
// gets a numeric count, and an event is written without changing lastEventId.
// New writes mirror the candidate: stable event ID and increment + pointer.
async function participate(user, songId, protocol, { writeEvent = true, extraEvent = false } = {}) {
  const userRef = doc(user.db, 'users', user.uid);
  const songRef = doc(user.db, 'songs', songId);
  const eventRef = doc(collection(user.db, 'songs', songId, 'voteEvents'));
  await runTransaction(user.db, async transaction => {
    const [userSnap, songSnap] = await Promise.all([transaction.get(userRef), transaction.get(songRef)]);
    const profile = userSnap.data();
    const isProposal = !songSnap.exists();
    const key = isProposal ? 'proposals' : 'votes';
    if (profile[key].includes(songId)) throw new Error('Fixture already holds this token');
    const proposals = isProposal ? [...profile.proposals, songId] : profile.proposals;
    const votes = isProposal ? profile.votes : [...profile.votes, songId];
    transaction.set(userRef, { proposals, votes }, { merge: true });
    const pointer = protocol === 'new' ? { lastEventId: eventRef.id } : {};
    if (isProposal) {
      transaction.set(songRef, {
        title: 'Synthetic rollout song', votes: 1, firstVotedAt: serverTimestamp(),
        proposerName: profile.djName || 'ANONYMOUS', ...pointer,
      });
    } else {
      transaction.update(songRef, {
        votes: protocol === 'new' ? increment(1) : songSnap.data().votes + 1, ...pointer,
      });
    }
    const event = {
      kind: 'vote_event', userId: user.uid, songId, title: 'Synthetic rollout song',
      type: isProposal ? 'proposal' : 'vote',
      voterName: protocol === 'old' ? (profile.djName?.trim() || 'ANONYMOUS') : (profile.djName || 'ANONYMOUS'),
      ts: Date.now(),
    };
    if (writeEvent) transaction.set(eventRef, event);
    if (extraEvent) transaction.set(doc(collection(user.db, 'songs', songId, 'voteEvents')), event);
  });
  return eventRef.id;
}

async function withdraw(user, songId) {
  const userRef = doc(user.db, 'users', user.uid);
  const songRef = doc(user.db, 'songs', songId);
  await runTransaction(user.db, async transaction => {
    const [profileSnap, songSnap] = await Promise.all([transaction.get(userRef), transaction.get(songRef)]);
    const profile = profileSnap.data();
    const hasVote = profile.votes.includes(songId);
    transaction.set(userRef, {
      votes: hasVote ? profile.votes.filter(id => id !== songId) : profile.votes,
      proposals: !hasVote ? profile.proposals.filter(id => id !== songId) : profile.proposals,
    }, { merge: true });
    if (songSnap.exists()) {
      if (songSnap.data().votes <= 1) transaction.delete(songRef);
      else transaction.update(songRef, { votes: songSnap.data().votes - 1 });
    }
  });
}

test('production baseline accepts old transactions and rejects the new pointer format', async () => {
  const old = await createUser('old');
  await participate(old, 'baseline-old', 'old');
  await participate(await createUser('old'), 'baseline-old', 'old');
  await withdraw(old, 'baseline-old');
  const fresh = await createUser('old');
  await assert.rejects(participate(fresh, 'baseline-new', 'new'), denied);
  await assert.rejects(participate(fresh, 'baseline-old', 'new'), denied);
});

test('strict candidate accepts new format and safely rejects old format', async () => {
  await participate(await createUser('strict'), 'strict-new', 'new');
  const old = await createUser('strict');
  await assert.rejects(participate(old, 'strict-old', 'old'), denied);
  await assert.rejects(participate(old, 'strict-new', 'old'), denied);
});

test('compat accepts old -> new -> old on one song and preserves the new pointer', async () => {
  const first = await createUser('compat');
  await participate(first, 'mixed-old-first', 'old');
  const pointer = await participate(await createUser('compat'), 'mixed-old-first', 'new');
  await participate(await createUser('compat'), 'mixed-old-first', 'old');
  const song = (await getDoc(doc(first.db, 'songs', 'mixed-old-first'))).data();
  assert.equal(song.votes, 3);
  assert.equal(song.lastEventId, pointer);
  assert.equal((await getDocs(collection(first.db, 'songs', 'mixed-old-first', 'voteEvents'))).size, 3);
});

test('compat accepts new -> old -> new, with a fresh pointer on the next new vote', async () => {
  const first = await createUser('compat');
  const initial = await participate(first, 'mixed-new-first', 'new');
  await participate(await createUser('compat'), 'mixed-new-first', 'old');
  const latest = await participate(await createUser('compat'), 'mixed-new-first', 'new');
  const song = (await getDoc(doc(first.db, 'songs', 'mixed-new-first'))).data();
  assert.equal(song.votes, 3);
  assert.notEqual(initial, latest);
  assert.equal(song.lastEventId, latest);
});

test('legacy withdrawal works on a song with a new pointer and on a legacy song', async () => {
  const proposer = await createUser('compat');
  const voter = await createUser('compat');
  const pointer = await participate(proposer, 'withdraw-new', 'new');
  await participate(voter, 'withdraw-new', 'old');
  await withdraw(voter, 'withdraw-new');
  assert.equal((await getDoc(doc(voter.db, 'songs', 'withdraw-new'))).data().lastEventId, pointer);
  await withdraw(proposer, 'withdraw-new');
  assert.equal((await getDoc(doc(voter.db, 'songs', 'withdraw-new'))).exists(), false);
  await participate(proposer, 'withdraw-old', 'old');
  await withdraw(proposer, 'withdraw-old');
  assert.equal((await getDoc(doc(proposer.db, 'songs', 'withdraw-old'))).exists(), false);
});

test('legacy registration with unchanged arrays passes; stale arrays fail without resetting tokens', async () => {
  const user = await createUser('compat');
  await participate(user, 'registration-active', 'old');
  const profileRef = doc(user.db, 'users', user.uid);
  await setDoc(profileRef, {
    proposals: ['registration-active'], votes: [], isRegistered: true, email: user.email, djName: 'Synthetic DJ',
  }, { merge: true });
  const stale = await createUser('compat');
  await participate(stale, 'registration-race', 'old');
  await assert.rejects(setDoc(doc(stale.db, 'users', stale.uid), {
    proposals: [], votes: [], isRegistered: true, email: stale.email, djName: 'Synthetic DJ',
  }, { merge: true }), denied);
  const preserved = (await getDoc(doc(stale.db, 'users', stale.uid))).data();
  assert.deepEqual(preserved.proposals, ['registration-race']);
  assert.equal(preserved.isRegistered, undefined);
});

test('compat enforces proposal and vote capacity for both protocols', async () => {
  for (const protocol of ['old', 'new']) {
    for (const key of ['proposals', 'votes']) {
      const user = await createUser('compat');
      const limit = key === 'proposals' ? 3 : 5;
      await seed('compat', `users/${user.uid}`, { proposals: [], votes: [], [key]: Array.from({ length: limit }, (_, n) => `held-${n}`) });
      const songId = `capacity-${protocol}-${key}`;
      if (key === 'votes') await seed('compat', `songs/${songId}`, { title: 'Synthetic rollout song', votes: 1 });
      await assert.rejects(participate(user, songId, protocol), denied);
      assert.equal((await getDoc(doc(user.db, 'users', user.uid))).data()[key].length, limit);
    }
  }
});

test('compat rejects standalone queue mutations and standalone token consumption', async () => {
  const user = await createUser('compat');
  await assert.rejects(setDoc(doc(user.db, 'songs', 'standalone-create'), { title: 'Synthetic rollout song', votes: 1 }), denied);
  await seed('compat', 'songs/standalone-update', { title: 'Synthetic rollout song', votes: 1 });
  await assert.rejects(updateDoc(doc(user.db, 'songs', 'standalone-update'), { votes: 2 }), denied);
  await assert.rejects(updateDoc(doc(user.db, 'users', user.uid), { votes: ['standalone-update'] }), denied);
});

test('compat documents the legacy gap: an otherwise valid token operation can omit or duplicate events', async () => {
  const proposer = await createUser('compat');
  await participate(proposer, 'legacy-gap', 'old', { writeEvent: false });
  assert.equal((await getDocs(collection(proposer.db, 'songs', 'legacy-gap', 'voteEvents'))).size, 0);
  await participate(await createUser('compat'), 'legacy-gap', 'old', { extraEvent: true });
  assert.equal((await getDocs(collection(proposer.db, 'songs', 'legacy-gap', 'voteEvents'))).size, 2);
  assert.equal((await getDoc(doc(proposer.db, 'songs', 'legacy-gap'))).data().votes, 2);
});

test('compat still rejects missing and extra events when the new client changes the pointer', async () => {
  for (const options of [{ writeEvent: false }, { extraEvent: true }]) {
    const user = await createUser('compat');
    const songId = `new-gap-${++sequence}`;
    await assert.rejects(participate(user, songId, 'new', options), denied);
    assert.equal((await getDoc(doc(user.db, 'songs', songId))).exists(), false);
    assert.deepEqual((await getDoc(doc(user.db, 'users', user.uid))).data().proposals, []);
  }
});

test('minimal compat preserves baseline read surface: nested events only, no social or collection-group grant', async () => {
  for (const lane of ['old', 'compat']) {
    const user = await createUser(lane);
    await participate(user, `read-surface-${lane}`, 'old');
    assert.equal((await getDocs(collection(user.db, 'songs', `read-surface-${lane}`, 'voteEvents'))).size, 1);
    await assert.rejects(getDocs(query(collectionGroup(user.db, 'voteEvents'), where('kind', '==', 'vote_event'))), denied);
    await seed(lane, 'rooms/catrina/presence/synthetic', { visible: true });
    await assert.rejects(getDoc(doc(user.db, 'rooms', 'catrina', 'presence', 'synthetic')), denied);
  }
});
