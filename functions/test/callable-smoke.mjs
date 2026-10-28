import assert from 'node:assert/strict';
import { initializeApp as initAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClient, deleteApp as deleteClient } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { cleanupFixtureUsers } from './fixtureCleanup.mjs';
import { CATALOG_BY_ID } from '../src/generated/socialCatalog.mjs';

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
const newShopItem = CATALOG_BY_ID['face-moustache'];
const shopRef = db.doc(`socialCatalog/${newShopItem.id}`);
const originalShopItem = await shopRef.get();
try {
  await shopRef.set(newShopItem);
  for (const [index, user] of users.entries()) {
    await adminAuth.createUser({ uid: user.uid, email: user.email, password });
    created.push(user.uid);
    await db.doc(`users/${user.uid}`).set({ isRegistered: true, email: user.email, djName: `Smoke ${index}`, proposals: [], votes: [], points: 200, totalPointsEarned: 300, achievements: [] });
    if (index === 0) {
      // A profile created before skin and face existed must receive the new starter items.
      await db.doc(`socialUsers/${user.uid}`).set({ equipped: { hair: 'hair-short', top: 'tee-cream', bottom: 'jeans', shoes: 'sneakers', accessory: null }, visible: false, zone: null, version: 'legacy-version', favoriteSong: null, muteInvites: false, joinedAt: Date.now() });
    }
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
  for (const itemId of ['skin-light', 'skin-tan', 'skin-deep', 'face-natural', 'face-freckles', 'hair-bob']) {
    assert.equal((await db.doc(`socialUsers/${users[0].uid}/inventory/${itemId}`).get()).exists, true, `${itemId} granted to existing profile`);
  }
  const shownA = (await a.call({ action: 'show', zone: 'bar' })).data.presence;
  const shownB = (await b.call({ action: 'show', zone: 'pool' })).data.presence;
  assert.equal(shownA.uid, users[0].uid);
  assert.equal(shownB.uid, users[1].uid);
  await a.call({ action: 'equip', itemId: 'face-freckles' });
  await a.call({ action: 'equip', itemId: 'skin-deep' });
  const presence = (await db.doc(`rooms/catrina/presence/${users[0].uid}`).get()).data();
  assert.equal(presence.equipped.face, 'face-freckles');
  assert.equal(presence.equipped.skin, 'skin-deep');
  const purchase = (await a.call({ action: 'buy', itemId: newShopItem.id, requestId: `avatar-buy-${run}` })).data;
  assert.equal(purchase.points, 200 - newShopItem.price);
  await a.call({ action: 'equip', itemId: newShopItem.id });
  assert.equal((await db.doc(`rooms/catrina/presence/${users[0].uid}`).get()).data().equipped.face, newShopItem.id);
  const invitation = (await a.call({ action: 'invite', recipientId: users[1].uid, type: 'pool', requestId: `invite-${run}` })).data.invitation;
  const accepted = (await b.call({ action: 'respond', id: invitation.id, response: 'accepted' })).data.invitation;
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.senderZone, 'bar');
  assert.equal(accepted.recipientZone, 'pool');
  const card = (await b.call({ action: 'card', uid: users[0].uid })).data.card;
  assert.equal(card.name, 'Smoke 0');
  await a.call({ action: 'hide' });
  await assert.rejects(b.call({ action: 'card', uid: users[0].uid }));
  console.log('Callable smoke passed: legacy avatar grants, equip, purchase, presence, invitation, card, hide');
} finally {
  try { await cleanupFixtureUsers(db, created, adminAuth); }
  finally {
    if (originalShopItem.exists) await shopRef.set(originalShopItem.data());
    else await shopRef.delete();
    await Promise.all(clients.map(({ app }) => deleteClient(app)));
    await deleteAdmin(adminApp);
  }
}
