import assert from 'node:assert/strict';
import { initializeApp as initAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClient, deleteApp as deleteClient } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { cleanupFixtureUsers } from './fixtureCleanup.mjs';

if (process.env.GCLOUD_PROJECT !== 'demo-catrina-social' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST) {
  throw new Error('Callable smoke requires demo-catrina-social and all three local emulators');
}
const run = Date.now().toString(36);
const adminApp = initAdmin({ projectId: 'demo-catrina-social' }, `callable-admin-${run}`);
const adminAuth = getAdminAuth(adminApp), db = getFirestore(adminApp);
const clients = [];
const created = [];
const users = [
  { uid: `smoke-alba-${run}`, email: `smoke-alba-${run}@example.test`, zone: 'bar' },
  { uid: `smoke-bruno-${run}`, email: `smoke-bruno-${run}@example.test`, zone: 'pool' },
];
const password = 'LocalSmoke2026!';
try {
  for (const [index, user] of users.entries()) {
    await adminAuth.createUser({ uid: user.uid, email: user.email, password });
    created.push(user.uid);
    await db.doc(`users/${user.uid}`).set({ isRegistered: true, email: user.email, djName: `Smoke ${index}`, proposals: [], votes: [], points: 200, totalPointsEarned: 300, achievements: [] });
    const app = initClient({ apiKey: 'demo-catrina-social-key', projectId: 'demo-catrina-social', appId: `smoke-${index}-${run}` }, `callable-${index}-${run}`);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const functions = getFunctions(app, 'europe-west1');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    await signInWithEmailAndPassword(auth, user.email, password);
    clients.push({ app, call: httpsCallable(functions, 'socialAction') });
  }
  const [a, b] = clients;
  assert.ok((await a.call({ action: 'initialize' })).data.profile);
  assert.ok((await b.call({ action: 'initialize' })).data.profile);
  const shownA = (await a.call({ action: 'show', zone: 'bar' })).data.presence;
  const shownB = (await b.call({ action: 'show', zone: 'pool' })).data.presence;
  assert.equal(shownA.uid, users[0].uid);
  assert.equal(shownB.uid, users[1].uid);
  const invitation = (await a.call({ action: 'invite', recipientId: users[1].uid, type: 'pool', requestId: `invite-${run}` })).data.invitation;
  const accepted = (await b.call({ action: 'respond', id: invitation.id, response: 'accepted' })).data.invitation;
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.senderZone, 'bar');
  assert.equal(accepted.recipientZone, 'pool');
  const card = (await b.call({ action: 'card', uid: users[0].uid })).data.card;
  assert.equal(card.name, 'Smoke 0');
  await a.call({ action: 'hide' });
  await assert.rejects(b.call({ action: 'card', uid: users[0].uid }));
  console.log('Callable smoke passed: real Auth tokens, initialize, presence, invitation, card, hide');
} finally {
  try { await cleanupFixtureUsers(db, created, adminAuth); }
  finally {
    await Promise.all(clients.map(({ app }) => deleteClient(app)));
    await deleteAdmin(adminApp);
  }
}
