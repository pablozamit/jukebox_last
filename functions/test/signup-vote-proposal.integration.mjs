import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { withProposalRaceRetry } from '../../web-app/src/queueTransaction.mjs';
import { initializeUserProfile, registerUserProfile } from '../../web-app/src/userProfile.mjs';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
  EmailAuthProvider,
  connectAuthEmulator,
  linkWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  getAuth,
} from 'firebase/auth';
import {
  addDoc,
  deleteDoc,
  deleteField,
  writeBatch,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  getFirestore,
} from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!projectId?.startsWith('demo-jukebox-flowtest-') || !authHost || !firestoreHost) {
  throw new Error('Requires isolated Auth and Firestore emulators with a demo-jukebox-flowtest-* project ID');
}

const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const email = `signup-${runId}@example.test`;
const password = 'IntegrationOnly2026!';
const mainApp = initializeClientApp({ apiKey: 'demo-key', projectId, appId: `signup-${runId}` }, `signup-${runId}`);
const auth = getAuth(mainApp);
const db = getFirestore(mainApp);
connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
const [firestoreName, firestorePort] = firestoreHost.split(':');
connectFirestoreEmulator(db, firestoreName, Number(firestorePort));

const adminApp = initializeAdminApp({ projectId }, `signup-admin-${runId}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const fixtureUsers = new Set();
const fixtureSongs = new Set();
const fixtureSuggestions = new Set();

after(async () => {
  for (const suggestionId of fixtureSuggestions) await adminDb.doc(`suggestions/${suggestionId}`).delete().catch(() => {});
  for (const songId of fixtureSongs) {
    const events = await adminDb.collection(`songs/${songId}/voteEvents`).get();
    await Promise.all(events.docs.map(event => event.ref.delete()));
    await adminDb.doc(`songs/${songId}`).delete().catch(() => {});
  }
  for (const uid of fixtureUsers) {
    await adminDb.doc(`users/${uid}`).delete().catch(() => {});
    await adminAuth.deleteUser(uid).catch(() => {});
  }
  await deleteClientApp(mainApp);
  await deleteAdminApp(adminApp);
});

async function createAnonymousProfile() {
  if (auth.currentUser) await signOut(auth);
  const credential = await signInAnonymously(auth);
  const user = credential.user;
  fixtureUsers.add(user.uid);
  await setDoc(doc(db, 'users', user.uid), { proposals: [], votes: [] });
  return user;
}

async function proposeOrVote(user, songId, title, { enforceClientLimit = true, eventOverrides = {}, writeEvent = true, additionalEvent = false, pointerOverride, eventId, clientDb = db, afterRead, writePointer = true } = {}) {
  fixtureSongs.add(songId);
  const userRef = doc(clientDb, 'users', user.uid);
  const songRef = doc(clientDb, 'songs', songId);
  const eventRef = eventId ? doc(clientDb, 'songs', songId, 'voteEvents', eventId) : doc(collection(clientDb, 'songs', songId, 'voteEvents'));
  let firstAttempt = true;
  const outcome = await withProposalRaceRetry(recordSongRead => runTransaction(clientDb, async transaction => {
    const [userSnap, songSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(songRef),
    ]);
    const proposalRace = recordSongRead(songSnap.exists());
    const profile = userSnap.data();
    if (afterRead && firstAttempt) {
      firstAttempt = false;
      await afterRead({ songExists: songSnap.exists() });
    }
    if (proposalRace && profile.proposals.includes(songId)) return { status: 'noop' };
    const isProposal = !songSnap.exists();
    const key = isProposal ? 'proposals' : 'votes';
    const limit = isProposal
      ? (profile.isRegistered ? 6 : 3)
      : (profile.isRegistered ? 10 : 5);
    const current = profile[key] || [];
    if (current.includes(songId)) return { status: 'noop' };
    if (enforceClientLimit && current.length >= limit) throw new Error(`${key} limit reached`);

    const next = [...current, songId];
    transaction.set(userRef, { [key]: next }, { merge: true });
    const eventPointer = writePointer ? { lastEventId: pointerOverride ?? eventRef.id } : {};
    if (isProposal) {
      transaction.set(songRef, { title, votes: 1, firstVotedAt: serverTimestamp(), proposerName: profile.djName || 'ANONYMOUS', ...eventPointer });
    } else {
      transaction.update(songRef, { votes: increment(1), ...eventPointer });
    }
    const event = {
      kind: 'vote_event',
      userId: user.uid,
      songId,
      title,
      type: isProposal ? 'proposal' : 'vote',
      voterName: profile.djName || 'ANONYMOUS',
      ts: Date.now(),
      ...eventOverrides,
    };
    if (writeEvent) transaction.set(eventRef, event);
    if (additionalEvent) transaction.set(doc(collection(clientDb, 'songs', songId, 'voteEvents')), event);
  }), async () => (await getDocFromServer(songRef)).exists());
  return outcome?.status === 'noop' ? null : eventRef.id;
}

async function seedSong(songId, title) {
  fixtureSongs.add(songId);
  await adminDb.doc(`songs/${songId}`).set({ title, votes: 1 });
}

test('registration preserves the anonymous UID and allows SDK proposal/vote flows under Firestore rules', async () => {
  const anonymous = await createAnonymousProfile();
  const originalUid = anonymous.uid;
  const linked = await linkWithCredential(anonymous, EmailAuthProvider.credential(email, password));
  assert.equal(linked.user.uid, originalUid, 'linking email/password must preserve the anonymous identity');
  await setDoc(doc(db, 'users', originalUid), {
    proposals: [],
    votes: [],
    isRegistered: true,
    email,
    djName: 'DJ Integration',
  }, { merge: true });
  const registeredProfile = (await getDoc(doc(db, 'users', originalUid))).data();
  assert.deepEqual(registeredProfile.proposals, []);
  assert.deepEqual(registeredProfile.votes, []);
  assert.equal(registeredProfile.isRegistered, true);
  assert.equal(registeredProfile.email, email);
  assert.equal(registeredProfile.djName, 'DJ Integration');

  await signOut(auth);
  const restored = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(restored.user.uid, originalUid, 'email/password login must recover the linked DJ profile');
  await assert.rejects(getDoc(doc(db, 'users', `${originalUid}-other`)), error => error.code === 'permission-denied');

  const duplicate = await createAnonymousProfile();
  await assert.rejects(
    linkWithCredential(duplicate, EmailAuthProvider.credential(email, password)),
    error => error.code === 'auth/email-already-in-use' || error.code === 'auth/credential-already-in-use',
  );
  await signOut(auth);
  const restoredAgain = await signInWithEmailAndPassword(auth, email, password);

  const proposalId = `it-proposal-${runId}`;
  fixtureSongs.add(proposalId);
  await proposeOrVote(restoredAgain.user, proposalId, 'Integration Proposal');
  assert.equal((await getDoc(doc(db, `songs/${proposalId}`))).data().votes, 1);
  assert.deepEqual((await getDoc(doc(db, `users/${originalUid}`))).data().proposals, [proposalId]);
  const proposalEvents = await getDocs(collection(db, `songs/${proposalId}/voteEvents`));
  assert.equal(proposalEvents.size, 1);
  assert.equal(proposalEvents.docs[0].data().type, 'proposal');

  const voter = await createAnonymousProfile();
  await proposeOrVote(voter, proposalId, 'Integration Proposal');
  assert.equal((await getDoc(doc(db, `songs/${proposalId}`))).data().votes, 2);
  assert.deepEqual((await getDoc(doc(db, `users/${voter.uid}`))).data().votes, [proposalId]);
  const voteEvents = await getDocs(collection(db, `songs/${proposalId}/voteEvents`));
  assert.equal(voteEvents.size, 2);
  assert.ok(voteEvents.docs.some(event => event.data().type === 'vote' && event.data().userId === voter.uid));

  const userVotesBeforeDirectWrite = (await getDoc(doc(db, 'users', voter.uid))).data().votes;
  const eventCountBeforeDirectWrite = voteEvents.size;
  let directSongIncrementAccepted = false;
  try {
    await updateDoc(doc(db, 'songs', proposalId), { votes: increment(1) });
    directSongIncrementAccepted = true;
  } catch (error) {
    if (error.code !== 'permission-denied') throw error;
  }
  assert.deepEqual((await getDoc(doc(db, 'users', voter.uid))).data().votes, userVotesBeforeDirectWrite);
  assert.equal((await getDocs(collection(db, `songs/${proposalId}/voteEvents`))).size, eventCountBeforeDirectWrite);
  assert.equal((await getDoc(doc(db, `songs/${proposalId}`))).data().votes, directSongIncrementAccepted ? 3 : 2);

  await assert.rejects(setDoc(doc(db, `songs/${proposalId}`), { title: 'tampered', votes: 50 }), error => error.code === 'permission-denied');
  await assert.rejects(setDoc(doc(db, `songs/${proposalId}/voteEvents/forged-${runId}`), {
    kind: 'vote_event', userId: voter.uid, songId: proposalId, title: 'Integration Proposal',
    type: 'vote', voterName: 'DJ Integration', ts: Date.now(),
  }), error => error.code === 'permission-denied');

  const suggestion = await addDoc(collection(db, 'suggestions'), { title: `Fixture ${runId}`, email, ts: Date.now() });
  fixtureSuggestions.add(suggestion.id);
  await assert.rejects(getDoc(suggestion), error => error.code === 'permission-denied');
  const unauthenticatedApp = initializeClientApp({ apiKey: 'demo-key', projectId, appId: `unauth-${runId}` }, `unauth-${runId}`);
  const unauthDb = getFirestore(unauthenticatedApp);
  const [unauthHost, unauthPort] = firestoreHost.split(':');
  connectFirestoreEmulator(unauthDb, unauthHost, Number(unauthPort));
  await assert.rejects(addDoc(collection(unauthDb, 'suggestions'), { title: 'Unauthenticated' }), error => error.code === 'permission-denied');
  await deleteClientApp(unauthenticatedApp);

  await assert.rejects(updateDoc(doc(db, 'users', originalUid), { isRegistered: false }), error => error.code === 'permission-denied');
  assert.equal(directSongIncrementAccepted, false, 'vote counts must be updated with the user token and certified vote event');
});

test('guest and registered proposal/vote capacity limits are enforced by real Firestore rules', async () => {
  const guest = await createAnonymousProfile();
  for (let i = 0; i < 3; i++) await proposeOrVote(guest, `guest-proposal-${runId}-${i}`, `Guest Proposal ${i}`);
  await assert.rejects(
    proposeOrVote(guest, `guest-proposal-over-${runId}`, 'Guest proposal over limit', { enforceClientLimit: false }),
    error => error.code === 'permission-denied',
  );

  for (let i = 0; i < 6; i++) await seedSong(`guest-vote-target-${runId}-${i}`, `Guest Vote Target ${i}`);
  for (let i = 0; i < 5; i++) await proposeOrVote(guest, `guest-vote-target-${runId}-${i}`, `Guest Vote Target ${i}`);
  await assert.rejects(
    proposeOrVote(guest, `guest-vote-target-${runId}-5`, 'Guest Vote Target 5', { enforceClientLimit: false }),
    error => error.code === 'permission-denied',
  );

  const registered = await createAnonymousProfile();
  const registeredEmail = `capacity-${runId}@example.test`;
  await linkWithCredential(registered, EmailAuthProvider.credential(registeredEmail, password));
  await setDoc(doc(db, 'users', registered.uid), {
    proposals: [], votes: [], isRegistered: true, email: registeredEmail, djName: 'DJ Capacity',
  }, { merge: true });
  for (let i = 0; i < 6; i++) {
    await proposeOrVote(registered, `registered-proposal-${runId}-${i}`, `Registered Proposal ${i}`);
  }
  const limitBypasses = [];
  try {
    await proposeOrVote(registered, `registered-proposal-over-${runId}`, 'Registered proposal over limit', { enforceClientLimit: false });
    limitBypasses.push('registered proposals: 7th action was accepted');
  } catch (error) {
    if (error.code !== 'permission-denied') throw error;
  }

  for (let i = 0; i < 11; i++) await seedSong(`registered-vote-target-${runId}-${i}`, `Registered Vote Target ${i}`);
  for (let i = 0; i < 10; i++) await proposeOrVote(registered, `registered-vote-target-${runId}-${i}`, `Registered Vote Target ${i}`);
  try {
    await proposeOrVote(registered, `registered-vote-target-${runId}-10`, 'Registered Vote Target 10', { enforceClientLimit: false });
    limitBypasses.push('registered votes: 11th action was accepted');
  } catch (error) {
    if (error.code !== 'permission-denied') throw error;
  }
  assert.deepEqual(limitBypasses, [], 'registered accounts must not exceed six proposals or ten votes');
});


const denied = error => error.code === 'permission-denied';

async function registerProfile(user, suffix) {
  const registeredEmail = `${suffix}-${runId}@example.test`;
  await linkWithCredential(user, EmailAuthProvider.credential(registeredEmail, password));
  await setDoc(doc(db, 'users', user.uid), {
    isRegistered: true, email: registeredEmail, djName: 'DJ Rules',
  }, { merge: true });
  return registeredEmail;
}

// Mirrors App.handleRemoveAction, including historical overlap and stale tokens.
async function removeAction(user, songId) {
  await runTransaction(db, async transaction => {
    const userRef = doc(db, 'users', user.uid);
    const songRef = doc(db, 'songs', songId);
    const [userSnap, songSnap] = await Promise.all([transaction.get(userRef), transaction.get(songRef)]);
    const profile = userSnap.data();
    const hasVote = profile.votes.includes(songId);
    const hasProposal = profile.proposals.includes(songId);
    if (!hasVote && !hasProposal) return;
    transaction.set(userRef, {
      votes: hasVote ? profile.votes.filter(id => id !== songId) : profile.votes,
      proposals: !hasVote && hasProposal ? profile.proposals.filter(id => id !== songId) : profile.proposals,
    }, { merge: true });
    if (songSnap.exists()) {
      if (songSnap.data().votes <= 1) transaction.delete(songRef);
      else transaction.update(songRef, { votes: songSnap.data().votes - 1 });
    }
  });
}

test('profile creation rejects prefilled, duplicate and malformed action arrays', async () => {
  if (auth.currentUser) await signOut(auth);
  const { user } = await signInAnonymously(auth);
  fixtureUsers.add(user.uid);
  const profileRef = doc(db, 'users', user.uid);
  for (const payload of [
    { proposals: ['fake'], votes: [] },
    { proposals: [], votes: ['fake', 'fake'] },
    { proposals: {}, votes: [] },
    { proposals: [], votes: 'fake' },
    { proposals: [], votes: [], isRegistered: true, email: 'forged@example.test' },
  ]) await assert.rejects(setDoc(profileRef, payload), denied);
  await setDoc(profileRef, { proposals: [], votes: [] });
  await registerProfile(user, 'direct-create');
  await adminDb.doc(`users/${user.uid}`).delete();
  await setDoc(profileRef, {
    proposals: [], votes: [], isRegistered: true,
    email: `direct-create-${runId}@example.test`, djName: 'Direct Registered',
  });
});

test('registration and profile editing cannot reset, replace or bypass action arrays', async () => {
  const user = await createAnonymousProfile();
  const songId = `preserve-signup-${runId}`;
  await proposeOrVote(user, songId, 'Preserved proposal');
  const registeredEmail = await registerProfile(user, 'preserve-signup');
  const profileRef = doc(db, 'users', user.uid);
  for (const payload of [
    { proposals: [], isRegistered: true, email: registeredEmail },
    { proposals: ['replacement'], isRegistered: true, email: registeredEmail },
    { votes: ['fabricated'], isRegistered: true, email: registeredEmail },
    { proposals: [], djName: 'Bypass profile edit' },
  ]) await assert.rejects(updateDoc(profileRef, payload), denied);
  assert.deepEqual((await getDoc(profileRef)).data().proposals, [songId]);
  await updateDoc(profileRef, { djName: 'Updated DJ', favorites: ['fav'] });
});

test('standalone queue and profile writes cannot add or release votes or proposals', async () => {
  const user = await createAnonymousProfile();
  const newSongId = `standalone-new-${runId}`;
  fixtureSongs.add(newSongId);
  await assert.rejects(setDoc(doc(db, 'songs', newSongId), { title: 'Unpaired', votes: 1 }), denied);
  await assert.rejects(updateDoc(doc(db, 'users', user.uid), { proposals: [newSongId] }), denied);
  const target = `standalone-existing-${runId}`;
  await seedSong(target, 'Existing target');
  await assert.rejects(updateDoc(doc(db, 'users', user.uid), { votes: [target] }), denied);
  await assert.rejects(updateDoc(doc(db, 'songs', target), { votes: increment(1) }), denied);
  await assert.rejects(deleteDoc(doc(db, 'songs', target)), denied);
  await proposeOrVote(user, target, 'Existing target');
  await assert.rejects(updateDoc(doc(db, 'songs', target), { votes: increment(-1) }), denied);
  await assert.rejects(updateDoc(doc(db, 'users', user.uid), { votes: [] }), denied);
  assert.equal((await getDoc(doc(db, 'songs', target))).data().votes, 2);
  assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data().votes, [target]);
});

test('withdrawal returns one token, removes the last vote, and cleans stale queue tokens', async () => {
  const user = await createAnonymousProfile();
  await registerProfile(user, 'withdrawal');
  const songId = `withdrawal-${runId}`;
  await proposeOrVote(user, songId, 'Withdrawal proposal');
  await proposeOrVote(user, songId, 'Withdrawal proposal');
  const profileRef = doc(db, 'users', user.uid);
  assert.deepEqual((await getDoc(profileRef)).data().proposals, [songId]);
  assert.deepEqual((await getDoc(profileRef)).data().votes, [songId]);
  await removeAction(user, songId);
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 1);
  assert.deepEqual((await getDoc(profileRef)).data().proposals, [songId]);
  assert.deepEqual((await getDoc(profileRef)).data().votes, []);
  await removeAction(user, songId);
  assert.equal((await getDoc(doc(db, 'songs', songId))).exists(), false);
  assert.deepEqual((await getDoc(profileRef)).data().proposals, []);
  assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 2);
  const missing = `played-stale-${runId}`;
  await adminDb.doc(`users/${user.uid}`).update({ votes: [missing] });
  await removeAction(user, missing);
  assert.deepEqual((await getDoc(profileRef)).data().votes, []);
  await adminDb.doc(`users/${user.uid}`).update({ proposals: [missing] });
  await removeAction(user, missing);
  assert.deepEqual((await getDoc(profileRef)).data().proposals, []);
});

test('wrong-song token changes and duplicated lists cannot authorize multiple queue mutations', async () => {
  const user = await createAnonymousProfile();
  const a = `list-a-${runId}`, b = `list-b-${runId}`, c = `list-c-${runId}`;
  for (const id of [a, b, c]) {
    await seedSong(id, id);
    await adminDb.doc(`songs/${id}`).update({ votes: 2 });
  }
  await adminDb.doc(`users/${user.uid}`).update({ votes: [a, b, c] });
  const removal = writeBatch(db);
  removal.update(doc(db, 'users', user.uid), { votes: [a, a] });
  removal.update(doc(db, 'songs', b), { votes: 1 });
  removal.update(doc(db, 'songs', c), { votes: 1 });
  await assert.rejects(removal.commit(), denied);
  const mismatch = writeBatch(db);
  mismatch.update(doc(db, 'users', user.uid), { votes: [a, b] });
  mismatch.update(doc(db, 'songs', b), { votes: 1 });
  await assert.rejects(mismatch.commit(), denied);
  await adminDb.doc(`users/${user.uid}`).update({ votes: [a, a] });
  const addition = writeBatch(db);
  addition.update(doc(db, 'users', user.uid), { votes: [a, b, c] });
  addition.update(doc(db, 'songs', b), { votes: 3 });
  addition.update(doc(db, 'songs', c), { votes: 3 });
  await assert.rejects(addition.commit(), denied);
  assert.equal((await getDoc(doc(db, 'songs', b))).data().votes, 2);
  assert.equal((await getDoc(doc(db, 'songs', c))).data().votes, 2);
});

test('concurrent votes cannot consume more than the remaining guest capacity', async () => {
  const user = await createAnonymousProfile();
  const targets = Array.from({ length: 6 }, (_, index) => `race-capacity-${runId}-${index}`);
  for (const target of targets) await seedSong(target, target);
  for (const target of targets.slice(0, 4)) await proposeOrVote(user, target, target);
  const results = await Promise.allSettled(targets.slice(4).map(target => proposeOrVote(user, target, target, { enforceClientLimit: false })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(results.some(result => result.status === 'rejected' && denied(result.reason)));
  const profile = (await getDoc(doc(db, 'users', user.uid))).data();
  assert.equal(profile.votes.length, 5);
  assert.equal(new Set(profile.votes).size, 5);
  const counts = await Promise.all(targets.slice(4).map(async target => (await getDoc(doc(db, 'songs', target))).data().votes));
  assert.deepEqual(counts.sort(), [1, 2]);
  const eventCounts = await Promise.all(targets.slice(4).map(async target => (await getDocs(collection(db, 'songs', target, 'voteEvents'))).size));
  assert.deepEqual(eventCounts.sort(), [0, 1]);
});

test('admin queue override remains available through the existing admins document', async () => {
  const user = await createAnonymousProfile();
  await adminDb.doc(`admins/${user.uid}`).set({ test: true });
  try {
    const target = `admin-override-${runId}`;
    fixtureSongs.add(target);
    await setDoc(doc(db, 'songs', target), { title: 'Admin fixture', votes: 20 });
    await updateDoc(doc(db, 'songs', target), { votes: 30 });
    await deleteDoc(doc(db, 'songs', target));
    assert.equal((await getDoc(doc(db, 'songs', target))).exists(), false);
  } finally {
    await adminDb.doc(`admins/${user.uid}`).delete();
  }
});


test('malformed events reject the entire transaction and accepted events stay immutable', async () => {
  const user = await createAnonymousProfile();
  const invalidEvents = [
    { userId: 'someone-else' }, { songId: 'wrong-song' }, { type: 'fake' },
    { title: 'wrong-title' }, { kind: 'wrong-kind' }, { voterName: '' },
    { ts: Date.now() - 11 * 60 * 1000 }, { ts: Date.now() + 5 * 60 * 1000 },
    { extra: true },
  ];
  for (const [index, eventOverrides] of invalidEvents.entries()) {
    const songId = `invalid-event-${runId}-${index}`;
    await assert.rejects(proposeOrVote(user, songId, 'Event fixture', { eventOverrides }), denied);
    assert.equal((await getDoc(doc(db, 'songs', songId))).exists(), false);
    assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data().proposals, []);
    assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 0);
  }
  const validId = `immutable-event-${runId}`;
  await proposeOrVote(user, validId, 'Valid event fixture');
  const events = await getDocs(collection(db, 'songs', validId, 'voteEvents'));
  await assert.rejects(updateDoc(events.docs[0].ref, { voterName: 'Changed' }), denied);
  await assert.rejects(deleteDoc(events.docs[0].ref), denied);
});

test('concurrent duplicate votes and withdrawals apply at most one song delta per token', async () => {
  const user = await createAnonymousProfile();
  const songId = `race-duplicate-${runId}`;
  await seedSong(songId, 'Duplicate race');
  const attempts = await Promise.allSettled([
    proposeOrVote(user, songId, 'Duplicate race'),
    proposeOrVote(user, songId, 'Duplicate race'),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled' && typeof result.value === 'string').length, 1);
  assert.ok(attempts.every(result => result.status === 'fulfilled' || denied(result.reason)));
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 2);
  assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data().votes, [songId]);
  assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 1);
  const removals = await Promise.allSettled([removeAction(user, songId), removeAction(user, songId)]);
  assert.ok(removals.some(result => result.status === 'fulfilled'));
  assert.ok(removals.every(result => result.status === 'fulfilled' || denied(result.reason)));
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 1);
  assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data().votes, []);
});

test('real SDK registration preserves a proposal committed after its initial profile read', async () => {
  const user = await createAnonymousProfile();
  const registrationEmail = `registration-race-${runId}@example.test`;
  await linkWithCredential(user, EmailAuthProvider.credential(registrationEmail, password));
  const userRef = doc(db, 'users', user.uid);
  let releaseRegistration;
  let signalRead;
  const profileRead = new Promise(resolve => { signalRead = resolve; });
  const registrationCanContinue = new Promise(resolve => { releaseRegistration = resolve; });
  let firstRead = true;
  const registration = runTransaction(db, transaction => registerUserProfile({
    async get(ref) {
      const snapshot = await transaction.get(ref);
      if (firstRead) {
        firstRead = false;
        signalRead();
        await registrationCanContinue;
      }
      return snapshot;
    },
    set: (...args) => transaction.set(...args),
    update: (...args) => transaction.update(...args),
  }, userRef, { isRegistered: true, email: registrationEmail, djName: 'DJ Concurrent' }));
  await profileRead;
  const songId = `registration-race-proposal-${runId}`;
  try {
    await proposeOrVote(user, songId, 'Registration Race Proposal');
  } finally {
    releaseRegistration();
  }
  await registration;
  const profile = (await getDoc(userRef)).data();
  assert.deepEqual(profile.proposals, [songId]);
  assert.deepEqual(profile.votes, []);
  assert.equal(profile.isRegistered, true);
  assert.equal(profile.email, registrationEmail);
  assert.equal(profile.djName, 'DJ Concurrent');
  await runTransaction(db, transaction => initializeUserProfile(transaction, userRef));
  assert.deepEqual((await getDoc(userRef)).data(), profile, 'late initialization must preserve the completed profile');
});

test('initialization that read a missing profile cannot erase concurrent registration or votes', async () => {
  if (auth.currentUser) await signOut(auth);
  const { user } = await signInAnonymously(auth);
  fixtureUsers.add(user.uid);
  const registrationEmail = `initialization-race-${runId}@example.test`;
  await linkWithCredential(user, EmailAuthProvider.credential(registrationEmail, password));
  const userRef = doc(db, 'users', user.uid);
  let releaseInitialization;
  let signalRead;
  const profileRead = new Promise(resolve => { signalRead = resolve; });
  const initializationCanContinue = new Promise(resolve => { releaseInitialization = resolve; });
  let firstRead = true;
  const initialization = runTransaction(db, transaction => initializeUserProfile({
    async get(ref) {
      const snapshot = await transaction.get(ref);
      if (firstRead) {
        firstRead = false;
        assert.equal(snapshot.exists(), false);
        signalRead();
        await initializationCanContinue;
      }
      return snapshot;
    },
    set: (...args) => transaction.set(...args),
  }, userRef));
  // Observe both outcomes before resuming so a safe rules rejection cannot be
  // mistaken for an unhandled promise while the concurrent write completes.
  const initializationResult = initialization.then(() => 'completed', error => {
    if (!denied(error)) throw error;
    return 'permission-denied';
  });
  await profileRead;
  const songId = `initialization-race-proposal-${runId}`;
  try {
    await runTransaction(db, transaction => registerUserProfile(transaction, userRef, {
      isRegistered: true, email: registrationEmail, djName: 'DJ Initialization Race',
    }));
    await proposeOrVote(user, songId, 'Initialization Race Proposal');
  } finally {
    releaseInitialization();
  }
  const outcome = await initializationResult;
  const profile = (await getDoc(userRef)).data();
  assert.deepEqual(profile.proposals, [songId]);
  assert.deepEqual(profile.votes, []);
  assert.equal(profile.isRegistered, true);
  assert.equal(profile.email, registrationEmail);
  assert.equal(profile.djName, 'DJ Initialization Race');
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 1);
  console.log(`initialization race outcome: ${outcome}; registration and proposal preserved`);
});


test('every proposal and vote requires exactly one fresh event selected by lastEventId', async () => {
  const user = await createAnonymousProfile();
  for (const isExisting of [false, true]) {
    for (const [name, options] of [
      ['missing', { writeEvent: false }],
      ['old-client', { writePointer: false }],
      ['double', { additionalEvent: true }],
      ['wrong-pointer', { pointerOverride: 'not-the-created-event' }],
      ['path-pointer', { pointerOverride: 'nested/event' }],
      ['long-pointer', { pointerOverride: 'x'.repeat(129) }],
      ['wrong-type', { eventOverrides: { type: isExisting ? 'proposal' : 'vote' } }],
    ]) {
      const songId = `event-contract-${isExisting}-${name}-${runId}`;
      fixtureSongs.add(songId);
      if (isExisting) await seedSong(songId, 'Event contract');
      const beforeProfile = (await getDoc(doc(db, 'users', user.uid))).data();
      await assert.rejects(proposeOrVote(user, songId, 'Event contract', options), denied);
      assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data(), beforeProfile);
      const song = await getDoc(doc(db, 'songs', songId));
      assert.equal(song.exists(), isExisting);
      if (isExisting) assert.equal(song.data().votes, 1);
      assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 0);
    }
  }
  const songId = `event-freshness-${runId}`;
  const proposalEventId = await proposeOrVote(user, songId, 'Event freshness');
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().lastEventId, proposalEventId);
  await assert.rejects(proposeOrVote(user, songId, 'Event freshness', { eventId: proposalEventId, writeEvent: false }), denied);
  await assert.rejects(proposeOrVote(user, songId, 'Event freshness', { eventId: proposalEventId }), denied);
  const voteEventId = await proposeOrVote(user, songId, 'Event freshness');
  assert.notEqual(voteEventId, proposalEventId);
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().lastEventId, voteEventId);
  const events = await getDocs(collection(db, 'songs', songId, 'voteEvents'));
  assert.equal(events.size, 2);
  assert.equal(events.docs.find(event => event.id === proposalEventId).data().type, 'proposal');
  assert.equal(events.docs.find(event => event.id === voteEventId).data().type, 'vote');
});

test('withdrawal preserves the event pointer and legacy songs need no event for withdrawal', async () => {
  const user = await createAnonymousProfile();
  const songId = `withdraw-pointer-${runId}`;
  await seedSong(songId, 'Pointer withdrawal');
  const voteEventId = await proposeOrVote(user, songId, 'Pointer withdrawal');
  for (const lastEventId of ['tampered-pointer', deleteField()]) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', user.uid), { votes: [] });
    batch.update(doc(db, 'songs', songId), { votes: 1, lastEventId });
    await assert.rejects(batch.commit(), denied);
    assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 2);
  }
  await removeAction(user, songId);
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().lastEventId, voteEventId);
  const legacyId = `legacy-withdraw-pointer-${runId}`;
  await seedSong(legacyId, 'Legacy withdrawal');
  await adminDb.doc(`songs/${legacyId}`).update({ votes: 2 });
  await adminDb.doc(`users/${user.uid}`).update({ votes: [legacyId] });
  await removeAction(user, legacyId);
  const legacySong = (await getDoc(doc(db, 'songs', legacyId))).data();
  assert.equal(legacySong.votes, 1);
  assert.equal(Object.hasOwn(legacySong, 'lastEventId'), false);
  await adminDb.doc(`users/${user.uid}`).update({ proposals: [legacyId] });
  await removeAction(user, legacyId);
  assert.equal((await getDoc(doc(db, 'songs', legacyId))).exists(), false);
});

test('two independent clients can concurrently vote with separate tokens and certified events', async () => {
  const firstUser = await createAnonymousProfile();
  const secondApp = initializeClientApp({ apiKey: 'demo-key', projectId, appId: `second-${runId}` }, `second-${runId}`);
  const secondAuth = getAuth(secondApp);
  const secondDb = getFirestore(secondApp);
  connectAuthEmulator(secondAuth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(secondDb, firestoreName, Number(firestorePort));
  try {
    const { user: secondUser } = await signInAnonymously(secondAuth);
    fixtureUsers.add(secondUser.uid);
    await setDoc(doc(secondDb, 'users', secondUser.uid), { proposals: [], votes: [] });
    const songId = `two-voters-${runId}`;
    await seedSong(songId, 'Two voters');
    const eventIds = await Promise.all([
      proposeOrVote(firstUser, songId, 'Two voters'),
      proposeOrVote(secondUser, songId, 'Two voters', { clientDb: secondDb }),
    ]);
    const song = (await getDoc(doc(db, 'songs', songId))).data();
    assert.equal(song.votes, 3);
    assert.ok(eventIds.includes(song.lastEventId));
    assert.deepEqual((await getDoc(doc(db, 'users', firstUser.uid))).data().votes, [songId]);
    assert.deepEqual((await getDoc(doc(secondDb, 'users', secondUser.uid))).data().votes, [songId]);
    const events = await getDocs(collection(db, 'songs', songId, 'voteEvents'));
    assert.equal(events.size, 2);
    assert.deepEqual(new Set(events.docs.map(event => event.data().userId)), new Set([firstUser.uid, secondUser.uid]));
  } finally {
    await deleteClientApp(secondApp);
  }
});


test('event names authenticate the transaction profile including anonymous and spaced legacy names', async () => {
  const user = await createAnonymousProfile();
  for (const [index, djName] of [undefined, '', 'DJ Named', '  Legacy DJ  '].entries()) {
    if (djName !== undefined) await updateDoc(doc(db, 'users', user.uid), { djName });
    const songId = `name-contract-${runId}-${index}`;
    await seedSong(songId, 'Name contract');
    await assert.rejects(proposeOrVote(user, songId, 'Name contract', { eventOverrides: { voterName: 'FORGED DJ' } }), denied);
    const eventId = await proposeOrVote(user, songId, 'Name contract');
    const event = (await getDoc(doc(db, 'songs', songId, 'voteEvents', eventId))).data();
    assert.equal(event.voterName, djName || 'ANONYMOUS');
  }
});

test('a concurrent DJ name change cannot commit an event with the stale profile name', async () => {
  const user = await createAnonymousProfile();
  await updateDoc(doc(db, 'users', user.uid), { djName: 'Before Name' });
  const songId = `name-race-${runId}`;
  await seedSong(songId, 'Name race');
  let release;
  let signalRead;
  const profileRead = new Promise(resolve => { signalRead = resolve; });
  const canContinue = new Promise(resolve => { release = resolve; });
  const voting = proposeOrVote(user, songId, 'Name race', { afterRead: async () => { signalRead(); await canContinue; } });
  const outcomePromise = voting.then(() => 'completed', error => {
    if (!denied(error)) throw error;
    return 'permission-denied';
  });
  await profileRead;
  await updateDoc(doc(db, 'users', user.uid), { djName: 'After Name' });
  release();
  const outcome = await outcomePromise;
  if (outcome === 'permission-denied') {
    assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 1);
    assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data().votes, []);
    assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 0);
    await proposeOrVote(user, songId, 'Name race');
  }
  console.log(`concurrent DJ rename outcome: ${outcome}; fresh event uses committed profile name`);
  const events = await getDocs(collection(db, 'songs', songId, 'voteEvents'));
  assert.equal(events.size, 1);
  assert.equal(events.docs[0].data().voterName, 'After Name');
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 2);
});

test('two initial proposals racing on an absent song preserve one event per committed token', async () => {
  const firstUser = await createAnonymousProfile();
  const secondApp = initializeClientApp({ apiKey: 'demo-key', projectId, appId: `proposal-racer-${runId}` }, `proposal-racer-${runId}`);
  const secondAuth = getAuth(secondApp);
  const secondDb = getFirestore(secondApp);
  connectAuthEmulator(secondAuth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(secondDb, firestoreName, Number(firestorePort));
  try {
    const { user: secondUser } = await signInAnonymously(secondAuth);
    fixtureUsers.add(secondUser.uid);
    await setDoc(doc(secondDb, 'users', secondUser.uid), { proposals: [], votes: [] });
    const songId = `two-initial-proposals-${runId}`;
    let release;
    let reads = 0;
    const bothRead = new Promise(resolve => { release = resolve; });
    const afterRead = async ({ songExists }) => {
      assert.equal(songExists, false);
      if (++reads === 2) release();
      await bothRead;
    };
    const outcomes = await Promise.allSettled([
      proposeOrVote(firstUser, songId, 'Initial proposals', { afterRead }),
      proposeOrVote(secondUser, songId, 'Initial proposals', { clientDb: secondDb, afterRead }),
    ]);
    assert.ok(outcomes.every(result => result.status === 'fulfilled'), 'both initial proposals must finish through the bounded race retry');
    const profiles = [
      (await getDoc(doc(db, 'users', firstUser.uid))).data(),
      (await getDoc(doc(secondDb, 'users', secondUser.uid))).data(),
    ];
    const committed = outcomes.filter(result => result.status === 'fulfilled').length;
    assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, committed);
    assert.equal(profiles.flatMap(profile => [...profile.proposals, ...profile.votes]).filter(id => id === songId).length, committed);
    assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, committed);
    console.log(`two initial proposals: ${committed} committed, ${2 - committed} safely rejected`);
    // A rejected losing proposer can submit again, now classified as a vote.
    for (const [index, result] of outcomes.entries()) {
      if (result.status === 'rejected') await proposeOrVote(index ? secondUser : firstUser, songId, 'Initial proposals', { clientDb: index ? secondDb : db });
    }
    assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 2);
    assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 2);
  } finally {
    await deleteClientApp(secondApp);
  }
});


test('proposal-race retry is bounded and never retries uncertain outcomes or masks real denial', async () => {
  for (const [code, exists, songAppeared, expectedAttempts, expectedReads] of [
    ['permission-denied', true, true, 1, 0],
    ['permission-denied', false, false, 1, 1],
    ['unavailable', false, true, 1, 0],
    ['deadline-exceeded', false, true, 1, 0],
    ['permission-denied', false, true, 2, 1],
  ]) {
    let attempts = 0;
    let reads = 0;
    const original = Object.assign(new Error('Rejected fixture'), { code });
    await assert.rejects(withProposalRaceRetry(async recordSongRead => {
      attempts++;
      recordSongRead(exists);
      throw original;
    }, async () => { reads++; return songAppeared; }), error => error === original);
    assert.equal(attempts, expectedAttempts);
    assert.equal(reads, expectedReads);
  }
  let reads = 0;
  await assert.rejects(withProposalRaceRetry(async recordSongRead => {
    recordSongRead(false);
    recordSongRead(true);
    throw Object.assign(new Error('Latest read saw existing song'), { code: 'permission-denied' });
  }, async () => { reads++; return true; }), denied);
  assert.equal(reads, 0);
});

test('a real rules denial remains rejected after the one allowed proposal-race retry', async () => {
  const user = await createAnonymousProfile();
  const songId = `invalid-race-retry-${runId}`;
  await assert.rejects(proposeOrVote(user, songId, 'Invalid retry fixture', {
    pointerOverride: 'invalid-event-pointer',
    afterRead: async ({ songExists }) => {
      assert.equal(songExists, false);
      await seedSong(songId, 'Invalid retry fixture');
    },
  }), denied);
  const profile = (await getDoc(doc(db, 'users', user.uid))).data();
  assert.deepEqual(profile.proposals, []);
  assert.deepEqual(profile.votes, []);
  assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 1);
  assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 0);
});


test('two sessions of one UID proposing concurrently produce one token/event and a silent no-op', async () => {
  const firstUser = await createAnonymousProfile();
  const loginEmail = await registerProfile(firstUser, 'same-uid-race');
  const secondApp = initializeClientApp({ apiKey: 'demo-key', projectId, appId: `same-uid-${runId}` }, `same-uid-${runId}`);
  const secondAuth = getAuth(secondApp);
  const secondDb = getFirestore(secondApp);
  connectAuthEmulator(secondAuth, `http://${authHost}`, { disableWarnings: true });
  connectFirestoreEmulator(secondDb, firestoreName, Number(firestorePort));
  try {
    const { user: secondUser } = await signInWithEmailAndPassword(secondAuth, loginEmail, password);
    assert.equal(secondUser.uid, firstUser.uid);
    const songId = `same-uid-proposal-${runId}`;
    let release;
    let reads = 0;
    const bothRead = new Promise(resolve => { release = resolve; });
    const afterRead = async ({ songExists }) => {
      assert.equal(songExists, false);
      if (++reads === 2) release();
      await bothRead;
    };
    const outcomes = await Promise.all([
      proposeOrVote(firstUser, songId, 'Same UID proposal', { afterRead }),
      proposeOrVote(secondUser, songId, 'Same UID proposal', { clientDb: secondDb, afterRead }),
    ]);
    assert.equal(outcomes.filter(id => id === null).length, 1);
    assert.equal(outcomes.filter(id => typeof id === 'string').length, 1);
    assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 1);
    const profile = (await getDoc(doc(db, 'users', firstUser.uid))).data();
    assert.deepEqual(profile.proposals, [songId]);
    assert.deepEqual(profile.votes, []);
    assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 1);
    // A subsequent, deliberate first attempt can still vote for the proposal.
    const deliberateEvent = await proposeOrVote(firstUser, songId, 'Same UID proposal');
    assert.equal(typeof deliberateEvent, 'string');
    assert.equal((await getDoc(doc(db, 'songs', songId))).data().votes, 2);
    assert.deepEqual((await getDoc(doc(db, 'users', firstUser.uid))).data().votes, [songId]);
    assert.equal((await getDocs(collection(db, 'songs', songId, 'voteEvents'))).size, 2);
  } finally {
    await deleteClientApp(secondApp);
  }
});


test('normal duplicate actions are no-ops even at capacity and leave pointer and events unchanged', async () => {
  const user = await createAnonymousProfile();
  const targets = Array.from({ length: 5 }, (_, index) => `duplicate-at-capacity-${runId}-${index}`);
  for (const target of targets) {
    await seedSong(target, 'Duplicate capacity');
    await proposeOrVote(user, target, 'Duplicate capacity');
  }
  const target = targets[0];
  const profileBefore = (await getDoc(doc(db, 'users', user.uid))).data();
  const songBefore = (await getDoc(doc(db, 'songs', target))).data();
  const eventsBefore = await getDocs(collection(db, 'songs', target, 'voteEvents'));
  assert.equal(await proposeOrVote(user, target, 'Duplicate capacity'), null);
  assert.deepEqual((await getDoc(doc(db, 'users', user.uid))).data(), profileBefore);
  assert.deepEqual((await getDoc(doc(db, 'songs', target))).data(), songBefore);
  assert.equal((await getDocs(collection(db, 'songs', target, 'voteEvents'))).size, eventsBefore.size);
  const missing = `duplicate-stale-proposal-${runId}`;
  await adminDb.doc(`users/${user.uid}`).update({ proposals: [missing, 'stale-other-1', 'stale-other-2'] });
  assert.equal(await proposeOrVote(user, missing, 'Stale duplicate proposal'), null);
  assert.equal((await getDoc(doc(db, 'songs', missing))).exists(), false);
  assert.equal((await getDocs(collection(db, 'songs', missing, 'voteEvents'))).size, 0);
});
