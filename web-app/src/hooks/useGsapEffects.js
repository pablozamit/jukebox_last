import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { resolveSongId } from '../appLogic';

gsap.registerPlugin(ScrollTrigger);

export function useGsapEffects({
  nowPlaying,
  activeQueue,
  isBridgeActive,
  catalog,
  searchTerm,
  isQueueCollapsed,
  userProposals,
  userVotes,
}) {
  const discRef = useRef(null);
  const countersRef = useRef(null);
  const npCardRef = useRef(null);
  const heartRef = useRef(null);
  const npPrevVotesRef = useRef(0);
  const voteButtonRefs = useRef(new Map());
  const voteCountRefs = useRef(new Map());
  const [lastVotedSongId, setLastVotedSongId] = useState(null);

  useEffect(() => {
    if (!discRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.to(discRef.current, {
        rotation: 360,
        duration: 4,
        repeat: -1,
        ease: 'none',
      });
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!npCardRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.from(npCardRef.current, {
        opacity: 0,
        y: 24,
        duration: 0.8,
        ease: 'power3.out',
      });
    });
    return () => ctx.revert();
  }, [nowPlaying]);

  useEffect(() => {
    if (!countersRef.current) return undefined;
    const ctx = gsap.context(() => {
      gsap.from(countersRef.current.children, {
        opacity: 0,
        y: 20,
        duration: 0.5,
        stagger: 0.12,
        ease: 'power2.out',
      });
    });
    return () => ctx.revert();
  }, [userProposals.length, userVotes.length]);

  // GSAP reveal en cola eliminado: re-animaba cada item en cada snapshot de
  // Firestore (votos, propuestas), lo que generaba el "bloque con líneas que
  // aparecen en tiempo real" que rompía el diseño clásico. Ahora los items de
  // la cola se actualizan in-place sin animación de entrada repetitiva.

  // === Heart burst: detectar en tiempo real cuando alguien vota la canción sonando ===
  useEffect(() => {
    if (!nowPlaying?.title || !isBridgeActive) {
      npPrevVotesRef.current = 0;
      return;
    }
    // Buscar la canción sonando en la cola activa por título
    const npSong = Object.values(activeQueue).find(s => resolveSongId(nowPlaying, [s]) === s.id && s.votes > 0);
    if (!npSong) {
      npPrevVotesRef.current = 0;
      return;
    }
    const currentVotes = npSong.votes || 0;
    // Si los votos aumentaron Y ya teníamos un conteo previo → alguien dio un "me gusta"
    if (currentVotes > npPrevVotesRef.current && npPrevVotesRef.current > 0 && heartRef.current) {
      gsap.killTweensOf(heartRef.current);
      gsap.timeline()
        .to(heartRef.current, { scale: 1.9, duration: 0.28, ease: 'back.out(2.5)' })
        .to(heartRef.current, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.38)' });
    }
    npPrevVotesRef.current = currentVotes;
  }, [activeQueue, nowPlaying, isBridgeActive]);

  useEffect(() => {
    const items = document.querySelectorAll('.catalog-reveal-item');
    if (items.length === 0) return undefined;
    const ctx = gsap.context(() => {
      items.forEach((item) => {
        gsap.from(item, {
          opacity: 0,
          y: 16,
          duration: 0.4,
          ease: 'power2.out',
          immediateRender: false,
          scrollTrigger: { trigger: item, start: 'top bottom', once: true },
        });
      });
    });
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [catalog, searchTerm, isQueueCollapsed]);

  const animateVote = (songId) => {
    const button = voteButtonRefs.current.get(songId);
    const count = voteCountRefs.current.get(songId);
    if (button) {
      button.classList.remove('vote-pop');
      void button.offsetWidth;
      button.classList.add('vote-pop');
    }
    if (count) {
      count.classList.remove('vote-count-pop');
      void count.offsetWidth;
      count.classList.add('vote-count-pop');
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
  };

  useEffect(() => {
    if (!lastVotedSongId) return undefined;
    const timer = window.setTimeout(() => setLastVotedSongId(null), 450);
    return () => window.clearTimeout(timer);
  }, [lastVotedSongId]);

  return {
    discRef,
    countersRef,
    npCardRef,
    heartRef,
    voteButtonRefs,
    voteCountRefs,
    lastVotedSongId,
    setLastVotedSongId,
    animateVote,
  };
}
