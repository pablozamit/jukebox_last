import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { cleanupFixtureUsers } from '../test/fixtureCleanup.mjs';

if (process.env.GCLOUD_PROJECT !== 'demo-catrina-social' || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST) {
  throw new Error('Fixture cleanup requires demo-catrina-social and all three local emulators');
}
const uids = process.argv.slice(2);
if (!uids.length || uids.some(uid => !/^(?:smoke-(?:alba|bruno)|test-(?:alice|bob|stranger))-[a-z0-9]+$/.test(uid))) {
  throw new Error('Pass exact smoke-alba/bruno or test-alice/bob/stranger fixture UIDs only');
}
const app = initializeApp({ projectId: 'demo-catrina-social' }, `fixture-cleanup-${Date.now()}`);
try {
  await cleanupFixtureUsers(getFirestore(app), [...new Set(uids)], getAuth(app));
  console.log(`Removed ${new Set(uids).size} named local test fixtures only.`);
} finally {
  await deleteApp(app);
}
