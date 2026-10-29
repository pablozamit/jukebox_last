import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export function useServerTime() {
  const serverTimeOffsetRef = useRef(0); // offset cliente→Firestore para getServerTime()
  const [currentTime, setCurrentTime] = useState(() => new Date().getTime());

  useEffect(() => {
    const fetchServerTimeOffset = async () => {
      try {
        const tempRef = doc(db, 'serverTime', 'offset');
        // Write a temporary document with server timestamp
        await setDoc(tempRef, { serverTimestamp: serverTimestamp() });
        const docSnap = await getDoc(tempRef);
        if (docSnap.exists()) {
          const serverTime = docSnap.data().serverTimestamp.toMillis();
          const clientTime = Date.now();
          const offset = serverTime - clientTime;
          serverTimeOffsetRef.current = offset; // Update ref for immediate use
        }
      } catch (error) {
        console.error("Error fetching server time offset:", error);
        serverTimeOffsetRef.current = 0;
      }
    };
    fetchServerTimeOffset();
  }, []);

  // Helper function to get adjusted server time
  const getServerTime = useCallback(() => Date.now() + serverTimeOffsetRef.current, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getServerTime()), 10000);
    return () => clearInterval(timer);
  }, [getServerTime]);

  return { getServerTime, currentTime };
}
