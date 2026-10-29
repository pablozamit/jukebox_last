import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator, setPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { firebaseRuntime } from './firebaseRuntime.mjs';

const runtime = firebaseRuntime(import.meta.env, window.location.hostname);
export const SOCIAL_MAP_ENABLED = runtime.socialEnabled;
export const IS_LOCAL_DEMO = runtime.useEmulators;

// Firebase web identifiers are public. Admin credentials never belong here.
const firebaseConfig = {
  apiKey: "AIzaSyD5iwh4Mk1dCoj5jScOXBLztYNGcmB6Etc",
  authDomain: "jukebox-catrinero.firebaseapp.com",
  projectId: "jukebox-catrinero",
  storageBucket: "jukebox-catrinero.firebasestorage.app",
  messagingSenderId: "570523922308",
  appId: "1:570523922308:web:4347d71452e0623c3777d1",
  measurementId: "G-0K0CVC6J6F"
};

// Initialize Firebase
const app = initializeApp(runtime.useEmulators ? {
  apiKey: 'demo-catrina-social-key',
  authDomain: 'localhost',
  projectId: runtime.projectId,
  appId: 'demo-catrina-social-web',
} : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, runtime.region || 'europe-west1');

// All emulator connections are established before auth or any database access.
if (runtime.useEmulators) {
  connectAuthEmulator(auth, `http://127.0.0.1:${runtime.authPort}`, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', runtime.firestorePort);
  connectFunctionsEmulator(functions, '127.0.0.1', runtime.functionsPort);
}

// Sign in anonymously on init
async function startSession() {
  if (runtime.useEmulators) await setPersistence(auth, browserSessionPersistence);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
}
startSession().catch((error) => {
  console.error("Error al iniciar sesión anónima:", error);
});
