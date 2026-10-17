import { useEffect, useRef, useState } from 'react';
import { collectionGroup, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { resolveSongId } from '../appLogic';

export function useNotifications({
  userId,
  userData,
  userProposals,
  activeQueue,
  catalog,
  queueSongs,
  nowPlaying,
  isBridgeActive,
  currentTime,
  isStaffHours,
  t,
  toast,
  getServerTime,
}) {
  const [activityEvents, setActivityEvents] = useState([]);
  const [showPlayingBanner, setShowPlayingBanner] = useState(false);
  const [playingBannerData, setPlayingBannerData] = useState(null);
  const lastPlayedSongRef = useRef(null);
  const playingBannerHideTimerRef = useRef(null);
  const lastVotesOrProposalsRef = useRef(null);
  const lastVoteCountsRef = useRef({});
  const ownVoteRef = useRef(null);
  const lastManualRemoveRef = useRef(null);
  const prevAchievementsRef = useRef(null);
  const nextSongNotifiedRef = useRef(null);
  const lastEventTsRef = useRef(0);
  const lastCallToastRef = useRef(false);
  const seenEventsRef = useRef(new Set());
  const voteNotifiedRef = useRef({});
  const userProposalsRef = useRef([]);
  const activeQueueRef = useRef({});

  const closePlayingBanner = () => {
    if (playingBannerHideTimerRef.current) {
      window.clearTimeout(playingBannerHideTimerRef.current);
      playingBannerHideTimerRef.current = null;
    }
    setShowPlayingBanner(false);
  };

  useEffect(() => {
    if (!nowPlaying || !userId) return undefined;
    const title = nowPlaying.title;
    const songId = resolveSongId(nowPlaying, catalog);
    const eventKey = songId || title;
    if (!title || eventKey === lastPlayedSongRef.current) return undefined;
    lastPlayedSongRef.current = eventKey;
    // Canción distinta: oculto el banner anterior y cancelo su timer de ocultado
    if (playingBannerHideTimerRef.current) {
      window.clearTimeout(playingBannerHideTimerRef.current);
      playingBannerHideTimerRef.current = null;
    }
    setShowPlayingBanner(false);
    let __myTracks = { proposals: [], votes: [] };
    try {
      const __raw = JSON.parse(localStorage.getItem('jb-my-tracks') || '{}');
      if (__raw.date === new Date().toDateString()) __myTracks = __raw;
    } catch { /* sin localStorage */ }
    const isProposed = (userData?.proposals || []).includes(songId) || (userData?.proposals || []).includes(title) || __myTracks.proposals.includes(songId) || __myTracks.proposals.includes(title);
    const isVoted = (userData?.votes || []).includes(songId) || (userData?.votes || []).includes(title) || __myTracks.votes.includes(songId) || __myTracks.votes.includes(title);
    if (!isProposed && !isVoted) return undefined;
    const showTimer = window.setTimeout(() => {
      setPlayingBannerData({ title, songId, isProposed, isVoted });
      setShowPlayingBanner(true);
      // El timer de ocultado vive en una ref: las actualizaciones de progreso
      // del bridge (misma canción) no lo cancelan. Se programa UNA vez por canción.
      playingBannerHideTimerRef.current = window.setTimeout(() => {
        playingBannerHideTimerRef.current = null;
        setShowPlayingBanner(false);
      }, 8000);
    }, 0);
    return () => window.clearTimeout(showTimer);
  }, [nowPlaying, userId, userData, catalog]);

  // Limpieza al desmontar: evita setState después de unmount
  useEffect(() => () => {
    if (playingBannerHideTimerRef.current) {
      window.clearTimeout(playingBannerHideTimerRef.current);
      playingBannerHideTimerRef.current = null;
    }
  }, []);

  // === Notificaciones en tiempo real ===
  useEffect(() => {
    lastVotesOrProposalsRef.current = null;
    lastVoteCountsRef.current = {};
    prevAchievementsRef.current = null;
    nextSongNotifiedRef.current = null;
    ownVoteRef.current = null;
    lastManualRemoveRef.current = null;
    lastEventTsRef.current = 0;
    seenEventsRef.current = new Set();
    voteNotifiedRef.current = {};
    userProposalsRef.current = [];
    activeQueueRef.current = {};
  }, [userId]);

  useEffect(() => {
    userProposalsRef.current = userProposals;
  }, [userProposals]);

  useEffect(() => {
    activeQueueRef.current = activeQueue;
  }, [activeQueue]);

  // Listener principal: el evento de voto (que viaja con el nombre del DJ) dispara la notificación
  useEffect(() => {
    if (!userId) return;
    lastEventTsRef.current = new Date().getTime();
    const statsQuery = query(
      collectionGroup(db, 'voteEvents'),
      where('kind', '==', 'vote_event'),
      limit(30)
    );
    const unsubscribe = onSnapshot(statsQuery, (snapshot) => {
      snapshot.docs.forEach((doc) => {
        const ev = doc.data();
        if (!ev || !ev.ts || !ev.countedSession) return;
        const eventKey = `${doc.id}:${ev.ts}`;
        if (!seenEventsRef.current.has(eventKey)) {
          seenEventsRef.current.add(eventKey);
          // Prevenir crecimiento indefinido: podar a las 50 entradas más recientes
          if (seenEventsRef.current.size > 100) {
            seenEventsRef.current = new Set(Array.from(seenEventsRef.current).slice(-50));
          }
          setActivityEvents(prev => [
            { type: ev.type === 'proposal' ? 'proposal' : 'vote', name: ev.voterName === 'ANONYMOUS' ? t.anonymous : (ev.voterName || t.anonymous), title: ev.title || ev.songId || '', ts: ev.ts },
            ...prev,
          ].slice(0, 15));
        }
        if (!(ev.ts > lastEventTsRef.current)) return;
        if (!userProposalsRef.current.includes(ev.songId)) return;
        const song = activeQueueRef.current[ev.songId];
        const ownVote = ownVoteRef.current;
        const isOwnVote = ownVote && ownVote.songId === ev.songId && (getServerTime() - ownVote.at < 3000);
        if (!song || song.votes < 2 || isOwnVote) return;
        if (voteNotifiedRef.current[ev.songId] === song.votes) return;
        voteNotifiedRef.current[ev.songId] = song.votes;
        const name = ev.voterName === 'ANONYMOUS' ? t.anonymous : (ev.voterName || t.anonymous);
        toast(t.notifVotedOnYourSong.replace('{name}', name).replace('{title}', song.title).replace('{votes}', song.votes), 'info', 4500);
      });
    });
    return unsubscribe;
  }, [userId, t, toast, getServerTime]);

  // Fallback: si el evento no llegó, la detección por delta en la cola avisa igualmente
  useEffect(() => {
    if (!userId) return;
    const now = getServerTime();
    Object.entries(activeQueue).forEach(([songId, song]) => {
      if (!userProposals.includes(songId)) return;
      const prev = lastVoteCountsRef.current[songId];
      if (prev === undefined) {
        lastVoteCountsRef.current[songId] = song.votes;
        return;
      }
      const ownVote = ownVoteRef.current;
      const isOwnVote = ownVote && ownVote.songId === songId && (now - ownVote.at < 3000);
      if (song.votes > prev && song.votes >= 2 && !isOwnVote) {
        if (voteNotifiedRef.current[songId] !== song.votes) {
          voteNotifiedRef.current[songId] = song.votes;
          toast(t.notifVotedOnYourSong.replace('{name}', t.someone).replace('{title}', song.title).replace('{votes}', song.votes), 'info', 4500);
        }
      }
      lastVoteCountsRef.current[songId] = song.votes;
    });
  }, [activeQueue, userProposals, userId, t, toast, getServerTime]);

  useEffect(() => {
    if (!userId || !userData) return;
    const curProposals = userData.proposals || [];
    const curVotes = userData.votes || [];
    const prevState = lastVotesOrProposalsRef.current;
    if (!prevState) {
      lastVotesOrProposalsRef.current = { proposals: curProposals, votes: curVotes };
      return;
    }
    const now = getServerTime();
    const lost = [
      ...prevState.proposals.filter(id => !curProposals.includes(id)),
      ...prevState.votes.filter(id => !curVotes.includes(id)),
    ];
    lost.forEach((songId) => {
      const manual = lastManualRemoveRef.current;
      if (manual && manual.songId === songId && (now - manual.at < 3000)) return;
      const title = activeQueue[songId]?.title || catalog.find(s => s.id === songId)?.title || songId;
      toast(t.notifTokenBack.replace('{title}', title), 'success', 4500);
    });
    lastVotesOrProposalsRef.current = { proposals: curProposals, votes: curVotes };
  }, [userData, userId, activeQueue, catalog, t, toast, getServerTime]);

  useEffect(() => {
    const cur = userData?.achievements;
    if (!cur) return;
    const achievementTitles = {
      first_vote: t.achievementFirstVote,
      protagonist: t.achievementProtagonist,
      hitmaker: t.achievementHitmaker,
      influencer: t.achievementInfluencer,
      streak: t.achievementStreak,
      loyal: t.achievementLoyal,
      early_bird: t.achievementEarlyBird,
      night_owl: t.achievementNightOwl,
    };
    const prev = prevAchievementsRef.current;
    if (prev !== null) {
      cur.filter(id => !prev.includes(id)).forEach((id) => {
        const title = achievementTitles[id];
        if (title) toast(`🏆 ${t.achievementUnlocked}: ${title}`, 'success', 4500);
      });
    }
    prevAchievementsRef.current = cur;
  }, [userData, t, toast]);

  useEffect(() => {
    if (!userId || queueSongs.length === 0) return;
    const top = queueSongs[0];
    if (!userProposals.includes(top.id) || nowPlaying?.title === top.title) {
      nextSongNotifiedRef.current = null;
      return;
    }
    if (nextSongNotifiedRef.current !== top.id) {
      nextSongNotifiedRef.current = top.id;
      toast(t.notifYourSongNext.replace('{title}', top.title), 'info', 6000);
    }
  }, [queueSongs, userProposals, userId, nowPlaying, t, toast]);

  // Última llamada: aviso 30 min antes del cierre (1:30)
  const closing = new Date(currentTime);
  closing.setHours(1, 30, 0, 0);
  if (currentTime > closing.getTime()) closing.setDate(closing.getDate() + 1);
  const minutesToClose = Math.round((closing.getTime() - currentTime) / 60000);
  const isLastCall = isBridgeActive && isStaffHours && minutesToClose > 0 && minutesToClose <= 30;

  useEffect(() => {
    if (isLastCall && !lastCallToastRef.current) {
      lastCallToastRef.current = true;
      toast(t.lastCallDesc, 'info', 8000);
    }
    if (!isLastCall) lastCallToastRef.current = false;
  }, [isLastCall, t, toast]);

  return {
    activityEvents,
    isLastCall,
    showPlayingBanner,
    playingBannerData,
    closePlayingBanner,
    ownVoteRef,
    lastVoteCountsRef,
    lastManualRemoveRef,
  };
}
