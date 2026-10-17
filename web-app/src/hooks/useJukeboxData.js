import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { firebaseErrorMessage } from '../firebaseErrorMessage';

export function useJukeboxData({ toast, t }) {
  const [catalog, setCatalog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jukebox-catalog-v2') || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('jukebox-catalog-v2') || '[]')).length === 0; } catch { return true; }
  });
  const [activeQueue, setActiveQueue] = useState({});
  const [nowPlaying, setNowPlaying] = useState(null);
  const [cooldowns, setCooldowns] = useState({});
  const [activeUsersCount, setActiveUsersCount] = useState(0);
  const [playedHistory, setPlayedHistory] = useState([]);
  const [nightlyTop, setNightlyTop] = useState(null);

  useEffect(() => {
    const stateRef = doc(db, 'state', 'nowPlaying');
    const unsubscribe = onSnapshot(stateRef, (docSnap) => {
      if (docSnap.exists()) setNowPlaying(docSnap.data());
    }, (error) => {
      console.error('Firebase nowPlaying listener error:', error);
      toast(`Reproducción: ${firebaseErrorMessage(error)}`, 'error');
    });
    return () => unsubscribe();
  }, [toast]);

  useEffect(() => {
    const cooldownsRef = doc(db, 'state', 'cooldowns');
    const unsubscribe = onSnapshot(cooldownsRef, (docSnap) => {
      if (docSnap.exists()) setCooldowns(docSnap.data());
    }, (error) => {
      console.error('Firebase cooldown listener error:', error);
      toast(`Cola: ${firebaseErrorMessage(error)}`, 'error');
    });
    return () => unsubscribe();
  }, [toast]);

  // C1: el catálogo solo cambia cuando edita el admin, así que se lee UNA vez por
  // sesión con getDoc en lugar de mantener un listener abierto (~200 KB por visita).
  // La copia en localStorage muestra el catálogo al instante mientras se refresca.
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const catalogRef = doc(db, 'catalog', 'full_list');
        const docSnap = await getDoc(catalogRef);
        if (docSnap.exists()) {
          const songs = docSnap.data().songs || [];
          setCatalog(songs);
          localStorage.setItem('jukebox-catalog-v2', JSON.stringify(songs));
        }
        setLoading(false);
      } catch (error) {
        console.error('Firebase catalog fetch error:', error);
        setLoading(false);
        toast(`Catálogo: ${firebaseErrorMessage(error)}`, 'error');
      }
    };
    fetchCatalog();
  }, [toast]);

  useEffect(() => {
    const songsRef = collection(db, 'songs');
    const unsubscribe = onSnapshot(songsRef, (snapshot) => {
      const queueMap = {};
      snapshot.docs.forEach(doc => { queueMap[doc.id] = doc.data(); });
      setActiveQueue(queueMap);
    }, (error) => {
      console.error('Firebase songs listener error:', error);
      toast(`Cola: ${firebaseErrorMessage(error)}`, 'error');
    });
    return () => unsubscribe();
  }, [toast]);

  // Usuarios activos: lo calcula y escribe el bridge en state/active_users.
  // Así la app no necesita leer toda la colección 'users' (las reglas de seguridad solo permiten leer tu propio doc).
  useEffect(() => {
    const activeRef = doc(db, 'state', 'active_users');
    const unsubscribe = onSnapshot(activeRef, (docSnap) => {
      setActiveUsersCount(docSnap.exists() ? (docSnap.data().count || 0) : 0);
    }, (error) => {
      console.error('Firebase active users listener error:', error);
    });
    return () => unsubscribe();
  }, []);

  // Últimas canciones sonadas (las escribe el bridge en state/played_history)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'state', 'played_history'), (docSnap) => {
      setPlayedHistory(docSnap.exists() ? (docSnap.data().songs || []) : []);
    });
    return unsubscribe;
  }, []);

  // DJ de la noche (lo escribe el bridge en leaderboard/noche)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'leaderboard', 'noche'), (snap) => {
      if (!snap.exists()) {
        setNightlyTop(null);
        return;
      }
      const data = snap.data();
      const points = data.points || {};
      const names = data.names || {};
      let best = null;
      Object.entries(points).forEach(([uid, pts]) => {
        if (!best || pts > best.points) best = { name: names[uid] || t.anonymous, points: pts };
      });
      setNightlyTop(best && best.points > 0 ? best : null);
    });
    return unsubscribe;
  }, [t]);

  return { catalog, loading, activeQueue, nowPlaying, cooldowns, activeUsersCount, playedHistory, nightlyTop };
}
