import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { SOCIAL_CATALOG } from '../src/generated/socialCatalog.mjs';
import { executeAction } from '../src/actions.mjs';

if (process.env.GCLOUD_PROJECT !== 'demo-catrina-social' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST) {
  throw new Error('Local seed requires demo-catrina-social and Auth, Firestore, Functions emulators');
}
initializeApp({ projectId: 'demo-catrina-social' });
const db = getFirestore(), auth = getAuth(), now = Date.now();
const fixtures = [
  { uid: 'dj-alba', email: 'dj-alba@example.test', name: 'Alba', zone: 'bar', favorite: 'La Noche.mp4' },
  { uid: 'dj-bruno', email: 'dj-bruno@example.test', name: 'Bruno', zone: 'pool', favorite: 'Sol de Octubre.mp4' },
];
for (const entry of SOCIAL_CATALOG) await db.doc(`socialCatalog/${entry.id}`).set({ ...entry, catalogVersion: 1 });
await db.doc('catalog/full_list').set({ songs: [
  { id: 'La Noche.mp4', title: 'La Noche', available: true },
  { id: 'Sol de Octubre.mp4', title: 'Sol de Octubre', available: true },
] });
await db.doc('state/nowPlaying').set({ title: 'La Noche', startedAt: now, totalTime: 210, lastActive: now, syntheticDemo: true });
await db.doc('state/cooldowns').set({});
await db.doc('state/active_users').set({ count: fixtures.length, syntheticDemo: true });
for (const fixture of fixtures) {
  const password = process.env.LOCAL_DEMO_PASSWORD || 'DemoLocal2026!';
  try { await auth.createUser({ uid: fixture.uid, email: fixture.email, password }); }
  catch (error) {
    if (error.code !== 'auth/uid-already-exists') throw error;
    await auth.updateUser(fixture.uid, { email: fixture.email, password });
  }
  await db.doc(`users/${fixture.uid}`).set({ proposals: [], votes: [], isRegistered: true, email: fixture.email,
    djName: fixture.name, points: 200, totalPointsEarned: 300, achievements: [], createdAt: now });
  const identity = { uid: fixture.uid, token: { email: fixture.email, firebase: { sign_in_provider: 'password' } } };
  await executeAction(db, identity, { action: 'initialize' }, now);
  await executeAction(db, identity, { action: 'favorite', songId: fixture.favorite }, now);
  await executeAction(db, identity, { action: 'show', zone: fixture.zone }, now);
}
console.log('Local demo seeded: dj-alba@example.test and dj-bruno@example.test; synthetic catalog and active playback marker.');
