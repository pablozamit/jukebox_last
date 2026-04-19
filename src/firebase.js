import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Remplaza esto con tu configuración de Firebase de la consola web
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
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Sign in anonymously on init
signInAnonymously(auth).catch((error) => {
  console.error("Error al iniciar sesión anónima:", error);
});
