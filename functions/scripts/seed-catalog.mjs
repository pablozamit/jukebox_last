import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SOCIAL_CATALOG } from '../src/generated/socialCatalog.mjs';

const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const projectId = projectIndex >= 0 ? args[projectIndex + 1] : null;
const apply = args.includes('--apply');
if (!projectId || !/^[a-z][a-z0-9-]{4,40}$/.test(projectId) || args.some(arg => !['--project', '--apply', projectId].includes(arg))) {
  throw new Error('Usage: node scripts/seed-catalog.mjs --project <explicit-project-id> [--apply]');
}
if (projectId === 'demo-catrina-social' && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  throw new Error('Demo project seed requires local Auth and Firestore emulators');
}
if (process.env.FIRESTORE_EMULATOR_HOST && projectId !== 'demo-catrina-social') {
  throw new Error('Only demo-catrina-social may be used with an emulator');
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) {
  throw new Error('GCLOUD_PROJECT does not match explicit project');
}
console.log(`Catalog v1: ${SOCIAL_CATALOG.length} items, project=${projectId}, mode=${apply ? 'apply' : 'dry-run'}`);
if (apply) {
  initializeApp({ projectId });
  const db = getFirestore();
  const batch = db.batch();
  for (const entry of SOCIAL_CATALOG) batch.set(db.doc(`socialCatalog/${entry.id}`), { ...entry, catalogVersion: 1 });
  await batch.commit();
  console.log('Catalog v1 written');
}
