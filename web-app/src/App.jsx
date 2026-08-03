import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { collection, onSnapshot, doc, updateDoc, increment, getDoc, setDoc, addDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, linkWithCredential, EmailAuthProvider, signOut, signInAnonymously, sendPasswordResetEmail } from 'firebase/auth';
import { Search, Flame, LogIn, Plus, Music2, X, HelpCircle, ArrowUp, Disc3, BarChart3, ChevronUp, ChevronDown, Trash2, Users, Trophy, Loader2, Heart, Crown } from 'lucide-react';
import { db, auth } from './firebase';
import { translations } from './translations';
import { useTheme } from './ThemeContext';
import { useToast } from './Toast';
import { CornerFlourish, OrnamentalDivider, SectionHeader, TextureOverlay } from './Ornaments';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
const Profile = lazy(() => import('./Profile'));
const StatsModal = lazy(() => import('./StatsModal'));

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const [catalog, setCatalog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jukebox-catalog-v2') || '[]'); } catch { return []; }
  });
  const [activeQueue, setActiveQueue] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProposals, setUserProposals] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [loading, setLoading] = useState(() => {
    try { return (JSON.parse(localStorage.getItem('jukebox-catalog-v2') || '[]')).length === 0; } catch { return true; }
  });
  const [cooldowns, setCooldowns] = useState({});
  const [currentTime, setCurrentTime] = useState(() => new Date().getTime());
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es');
  const [showHelp, setShowHelp] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [showScroll, setShowScroll] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestYoutubeUrl, setSuggestYoutubeUrl] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [activeUsersCount, setActiveUsersCount] = useState(0);

  const [userData, setUserData] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOutTokenCTA, setShowOutTokenCTA] = useState(false);
  const [showPlayingBanner, setShowPlayingBanner] = useState(false);
  const [playingBannerData, setPlayingBannerData] = useState(null);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDjName, setRegDjName] = useState('');
  const [authErrorMsg, setAuthErrorMsg] = useState('');
  const [authMode, setAuthMode] = useState('register');
  const [showDesignSurvey, setShowDesignSurvey] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState('all');
  const [activityEvents, setActivityEvents] = useState([]);
  const [playedHistory, setPlayedHistory] = useState([]);
  const [nightlyTop, setNightlyTop] = useState(null);
  const [showLastCall, setShowLastCall] = useState(true);
  const [themeSwitching, setThemeSwitching] = useState(false);
  const themeSwitchingRef = useRef(false);
  const lastPlayedSongRef = useRef(null);
  const prevThemeRef = useRef(theme);
  const surveyTimerRef = useRef(null);

  const discRef = useRef(null);
  const countersRef = useRef(null);
  const npCardRef = useRef(null);
  const voteButtonRefs = useRef(new Map());
  const voteCountRefs = useRef(new Map());
  const [lastVotedSongId, setLastVotedSongId] = useState(null);
  const lastVoteCountsRef = useRef({});
  const ownVoteRef = useRef(null);
  const lastVotesOrProposalsRef = useRef(null);
  const lastManualRemoveRef = useRef(null);
  const prevAchievementsRef = useRef(null);
  const nextSongNotifiedRef = useRef(null);
  const lastEventTsRef = useRef(0);
  const lastCallToastRef = useRef(false);
  const seenEventsRef = useRef(new Set());
  const voteNotifiedRef = useRef({});
  const userProposalsRef = useRef([]);
  const activeQueueRef = useRef({});

  const t = translations[lang];
  const djDisplayName = (userData?.djName && userData.djName.trim()) ? userData.djName.trim() : t.anonymous;
  const favorites = userData?.favorites || [];

  const toggleFavorite = (songId) => {
    if (!userId) {
      toast(t.authError, 'error');
      return;
    }
    const next = favorites.includes(songId)
      ? favorites.filter(id => id !== songId)
      : [...favorites, songId];
    setDoc(doc(db, 'users', userId), { favorites: next }, { merge: true })
      .catch((error) => toast(t.firebaseError + error.message, 'error'));
  };

  const MAX_PROPOSALS = isRegistered ? 6 : 3;
  const MAX_VOTES = (isRegistered ? 10 : 5) + (userData?.freeVotes || 0);

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const currentTimestamp = currentTime;

  useEffect(() => {
    const handleScroll = () => {
      setShowScroll(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let unsubUser = null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      if (user) {
        setUserId(user.uid);
        setIsRegistered(!!user.email);
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, { proposals: [], votes: [] });
        }
        unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProposals(data.proposals || []);
            setUserVotes(data.votes || []);
            setUserData(data);
          }
        });
      } else {
        setUserId(null);
        setIsRegistered(false);
        setUserProposals([]);
        setUserVotes([]);
        setUserData(null);
      }
    });
    return () => {
      unsubscribe();
      if (unsubUser) unsubUser();
    };
  }, []);

  useEffect(() => {
    const stateRef = doc(db, 'state', 'nowPlaying');
    const unsubscribe = onSnapshot(stateRef, (docSnap) => {
      if (docSnap.exists()) setNowPlaying(docSnap.data());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const cooldownsRef = doc(db, 'state', 'cooldowns');
    const unsubscribe = onSnapshot(cooldownsRef, (docSnap) => {
      if (docSnap.exists()) setCooldowns(docSnap.data());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const catalogRef = doc(db, 'catalog', 'full_list');
    const unsubscribe = onSnapshot(catalogRef, (docSnap) => {
      if (docSnap.exists()) {
        const songs = docSnap.data().songs || [];
        setCatalog(songs);
        localStorage.setItem('jukebox-catalog-v2', JSON.stringify(songs));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const songsRef = collection(db, 'songs');
    const unsubscribe = onSnapshot(songsRef, (snapshot) => {
      const queueMap = {};
      snapshot.docs.forEach(doc => { queueMap[doc.id] = doc.data(); });
      setActiveQueue(queueMap);
    });
    return () => unsubscribe();
  }, []);

  // Usuarios activos: lo calcula y escribe el bridge en state/active_users.
  // Así la app no necesita leer toda la colección 'users' (las reglas de seguridad solo permiten leer tu propio doc).
  useEffect(() => {
    const activeRef = doc(db, 'state', 'active_users');
    const unsubscribe = onSnapshot(activeRef, (docSnap) => {
      setActiveUsersCount(docSnap.exists() ? (docSnap.data().count || 0) : 0);
    });
    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    const items = document.querySelectorAll('.queue-reveal-item');
    if (items.length === 0) return undefined;
    const ctx = gsap.context(() => {
      items.forEach((item) => {
        gsap.from(item, {
          opacity: 0,
          x: -20,
          duration: 0.4,
          ease: 'power2.out',
          immediateRender: false,
          scrollTrigger: { trigger: item, start: 'top bottom', once: true },
        });
      });
    });
    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [activeQueue, isQueueCollapsed]);

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



  useEffect(() => {
    const answered = localStorage.getItem('design-survey-answered');
    if (theme === 'neon' && prevThemeRef.current === 'catrina' && !answered) {
      surveyTimerRef.current = setTimeout(() => {
        setShowDesignSurvey(true);
      }, 60000);
    }
    prevThemeRef.current = theme;
    return () => {
      if (surveyTimerRef.current) clearTimeout(surveyTimerRef.current);
    };
  }, [theme]);

  const submitDesignSurvey = async (preference) => {
    try {
      await addDoc(collection(db, 'design_feedback'), {
        preference,
        theme: 'neon',
        userId: userId || 'anonymous',
        timestamp: new Date().getTime(),
      });
    } catch {
      console.error('Survey save error');
    }
    localStorage.setItem('design-survey-answered', 'true');
    setSurveySubmitted(true);
    setTimeout(() => setShowDesignSurvey(false), 1500);
  };

  const dismissSurvey = () => {
    localStorage.setItem('design-survey-answered', 'true');
    setShowDesignSurvey(false);
  };

  const handleToggleTheme = () => {
    if (themeSwitchingRef.current) return;
    themeSwitchingRef.current = true;
    setThemeSwitching(true);
    const switchingToClassic = !isCatrina;
    toggleTheme();
    window.setTimeout(() => {
      const explainerSeen = localStorage.getItem('theme-explainer-seen');
      if (!explainerSeen) {
        localStorage.setItem('theme-explainer-seen', 'true');
        toast(switchingToClassic ? t.themeExplainerClassic : t.themeExplainerNeon, 'info', 6000);
      } else {
        toast(switchingToClassic ? t.themeSwitchedClassic : t.themeSwitchedNeon, 'success');
      }
      themeSwitchingRef.current = false;
      setThemeSwitching(false);
    }, 450);
  };

  const handleRemoveAction = async (songId) => {
    if (!userId) return;
    lastManualRemoveRef.current = { songId, at: new Date().getTime() };
    try {
      const userRef = doc(db, 'users', userId);
      let updatedVotes = [...userVotes];
      let updatedProposals = [...userProposals];
      let removed = false;
      const voteIndex = updatedVotes.indexOf(songId);
      if (voteIndex !== -1) {
        updatedVotes.splice(voteIndex, 1);
        await updateDoc(userRef, { votes: updatedVotes });
        removed = true;
      } else {
        const proposalIndex = updatedProposals.indexOf(songId);
        if (proposalIndex !== -1) {
          updatedProposals.splice(proposalIndex, 1);
          await updateDoc(userRef, { proposals: updatedProposals });
          removed = true;
        }
      }
      if (removed) {
        const currentVotes = activeQueue[songId]?.votes || 0;
        const songRef = doc(db, 'songs', songId);
        if (currentVotes <= 1) {
          await deleteDoc(songRef);
        } else {
          await updateDoc(songRef, { votes: increment(-1) });
        }
      }
    } catch (error) {
      toast(t.firebaseError + error.message, 'error');
    }
  };

  const handleVote = async (song) => {
    if (!userId) {
      toast(t.authError, 'error');
      return;
    }
    const isProposal = song.votes === 0;
    if (isProposal) {
      if (userProposals.length >= MAX_PROPOSALS) {
        if (!isRegistered) setShowOutTokenCTA(true);
        else toast(t.alreadyVoted, 'info');
        return;
      }
    } else {
      if (userVotes.length >= MAX_VOTES) {
        if (!isRegistered) setShowOutTokenCTA(true);
        else toast(t.alreadyVoted, 'info');
        return;
      }
    }
    // Registro optimista: evita notificarte a ti mismo tu propio voto
    ownVoteRef.current = { songId: song.id, at: new Date().getTime() };
    lastVoteCountsRef.current[song.id] = (activeQueue[song.id]?.votes || 0) + 1;
    // Evento público de voto: permite notificar al proponente con tu nombre de DJ
    addDoc(collection(db, 'statistics'), {
      kind: 'vote_event',
      songId: song.id,
      title: song.title,
      type: isProposal ? 'proposal' : 'vote',
      voterName: djDisplayName,
      ts: new Date().getTime(),
    })
      .then(() => {
        // Limpieza best-effort: borra eventos viejos de esta canción (más de 2h)
        const cutoff = new Date().getTime() - 2 * 60 * 60 * 1000;
        getDocs(query(collection(db, 'statistics'), where('songId', '==', song.id)))
          .then((snap) => {
            snap.docs
              .filter(d => d.data().kind === 'vote_event' && (d.data().ts || 0) < cutoff)
              .forEach(d => deleteDoc(d.ref));
          })
          .catch(() => {});
      })
      .catch(() => {});
    try {
      const userRef = doc(db, 'users', userId);
      if (isProposal) {
        await setDoc(userRef, { proposals: [...userProposals, song.id] }, { merge: true });
      } else {
        await setDoc(userRef, { votes: [...userVotes, song.id] }, { merge: true });
      }
      const songRef = doc(db, 'songs', song.id);
      const votedAt = new Date().getTime();
      await setDoc(songRef, {
        title: song.title,
        votes: increment(1),
        firstVotedAt: isProposal ? votedAt : (activeQueue[song.id]?.firstVotedAt || votedAt),
        ...(isProposal ? { proposerName: djDisplayName } : {})
      }, { merge: true });
      const now = new Date();
      let hour = now.getHours();
      let day = now.getDay();
      if (hour < 2) day = (day === 0) ? 6 : day - 1;
      const statsRef = collection(db, 'statistics');
      const songIncrement = { [song.id]: increment(1) };
      const hourKey = hour.toString();
      const dayKey = day.toString();
      await Promise.all([
        setDoc(doc(statsRef, 'votes_hoy'), songIncrement, { merge: true }),
        setDoc(doc(statsRef, 'votes_semana'), songIncrement, { merge: true }),
        setDoc(doc(statsRef, 'votes_mes'), songIncrement, { merge: true }),
        setDoc(doc(statsRef, 'votes_total'), songIncrement, { merge: true }),
        setDoc(doc(statsRef, 'time_hoy'), { [hourKey]: increment(1) }, { merge: true }),
        setDoc(doc(statsRef, 'time_semana'), { [dayKey]: increment(1) }, { merge: true })
      ]);
      setLastVotedSongId(song.id);
      animateVote(song.id);
    } catch (error) {
      lastVoteCountsRef.current[song.id] = activeQueue[song.id]?.votes || 0;
      toast(t.firebaseError + error.message, 'error');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthErrorMsg('');
    const djNameClean = regDjName.trim();
    if (!djNameClean) {
      setAuthErrorMsg(t.djNameEmpty);
      return;
    }
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        await signInAnonymously(auth);
        currentUser = auth.currentUser;
      }
      const credential = EmailAuthProvider.credential(regEmail, regPassword);
      await linkWithCredential(currentUser, credential);
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        isRegistered: true,
        email: regEmail,
        djName: djNameClean.slice(0, 20),
      }, { merge: true });
      setShowRegister(false);
      setShowLogin(false);
      setIsRegistered(true);
      toast(t.registerSuccess, 'success');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use' || error.code === 'auth/credential-already-in-use') {
        setAuthMode('login');
        setAuthErrorMsg(t.registerEmailInUse);
      } else {
        setAuthErrorMsg(error.code === 'auth/weak-password' ? t.weakPassword : error.message);
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthErrorMsg('');
    try {
      await signInWithEmailAndPassword(auth, regEmail, regPassword);
      setShowLogin(false);
      setShowRegister(false);
      setIsRegistered(true);
      toast(t.loginSuccess, 'success');
    } catch {
      setAuthErrorMsg(t.wrongCredentials);
    }
  };

  const handleForgotPassword = async () => {
    if (!regEmail) {
      setAuthErrorMsg(t.enterEmailFirst);
      return;
    }
    try {
      await sendPasswordResetEmail(auth, regEmail);
      toast(t.passwordResetSent, 'success');
    } catch {
      toast(t.passwordResetError, 'error');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setShowProfile(false);
    setShowRegister(false);
    setShowLogin(false);
    setIsRegistered(false);
    signInAnonymously(auth).catch(console.error);
  };

  useEffect(() => {
    if (!nowPlaying || !userId) return undefined;
    const title = nowPlaying.title;
    if (!title || title === lastPlayedSongRef.current) return undefined;
    lastPlayedSongRef.current = title;
    const isProposed = (userData?.proposals || []).includes(title);
    const isVoted = (userData?.votes || []).includes(title);
    if (!isProposed && !isVoted) return undefined;
    const showTimer = window.setTimeout(() => {
      setPlayingBannerData({ title, isProposed, isVoted });
      setShowPlayingBanner(true);
    }, 0);
    const hideTimer = window.setTimeout(() => setShowPlayingBanner(false), 8000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [nowPlaying, userId, userData]);

  const validateYoutubeUrl = (url) => {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url);
  };

  const handleSuggest = async () => {
    const titleToSuggest = suggestTitle || searchTerm;
    if (!titleToSuggest || !userId || !validateYoutubeUrl(suggestYoutubeUrl)) return;
    try {
      await addDoc(collection(db, 'suggestions'), {
        title: titleToSuggest,
        youtubeUrl: suggestYoutubeUrl,
        timestamp: new Date().getTime(),
        userId
      });
      setSuggested(true);
      setSuggestTitle('');
      setSuggestYoutubeUrl('');
      setTimeout(() => setSuggested(false), 3000);
    } catch (error) {
      toast(t.firebaseError + error.message, 'error');
    }
  };

  const mergedSongs = catalog
    .map(song => ({
      ...song,
      votes: activeQueue[song.id]?.votes || 0,
      firstVotedAt: activeQueue[song.id]?.firstVotedAt || null,
      proposerName: activeQueue[song.id]?.proposerName || null
    }))
    .filter(song => song.available !== false);

  const queueSongs = mergedSongs
    .filter(song => song.votes > 0)
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return (a.firstVotedAt || 0) - (b.firstVotedAt || 0);
    });

  const filteredCatalog = mergedSongs
    .filter(song => song.votes === 0)
    .filter(song => song.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(song => {
      if (catalogFilter === 'favorites') return favorites.includes(song.id);
      if (catalogFilter === 'mine') return userProposals.includes(song.id) || userVotes.includes(song.id);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const calculateProgress = () => {
    if (!nowPlaying || !nowPlaying.totalTime || nowPlaying.totalTime === 0) return 0;
    return (nowPlaying.currentTime / nowPlaying.totalTime) * 100;
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isBridgeActive = nowPlaying?.lastActive ? (currentTimestamp - nowPlaying.lastActive < 300000) : false;

  const checkIsStaffHours = () => {
    const now = new Date(currentTime);
    const day = now.getDay();
    const time = now.getHours() + now.getMinutes() / 60;
    const isEveningOpen = day >= 1 && day <= 6 && time >= 19;
    const isMorningOpen = (day >= 2 || day === 0) && time <= 1.5;
    return isEveningOpen || isMorningOpen;
  };

  // === Notificaciones en tiempo real ===
  useEffect(() => {
    lastVotesOrProposalsRef.current = null;
    lastVoteCountsRef.current = {};
    prevAchievementsRef.current = null;
    nextSongNotifiedRef.current = null;
    ownVoteRef.current = null;
    lastManualRemoveRef.current = null;
    lastEventTsRef.current = 0;
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
    const statsRef = collection(db, 'statistics');
    const unsubscribe = onSnapshot(statsRef, (snapshot) => {
      snapshot.docs.forEach((doc) => {
        const ev = doc.data();
        if (!ev || ev.kind !== 'vote_event' || !ev.ts) return;
        const eventKey = `${doc.id}:${ev.ts}`;
        if (!seenEventsRef.current.has(eventKey)) {
          seenEventsRef.current.add(eventKey);
          setActivityEvents(prev => [
            { type: ev.type === 'proposal' ? 'proposal' : 'vote', name: ev.voterName || t.anonymous, title: ev.title || ev.songId || '', ts: ev.ts },
            ...prev,
          ].slice(0, 15));
        }
        if (!(ev.ts > lastEventTsRef.current)) return;
        if (!userProposalsRef.current.includes(ev.songId)) return;
        const song = activeQueueRef.current[ev.songId];
        const ownVote = ownVoteRef.current;
        const isOwnVote = ownVote && ownVote.songId === ev.songId && (Date.now() - ownVote.at < 3000);
        if (!song || song.votes < 2 || isOwnVote) return;
        if (voteNotifiedRef.current[ev.songId] === song.votes) return;
        voteNotifiedRef.current[ev.songId] = song.votes;
        const name = ev.voterName || t.anonymous;
        toast(t.notifVotedOnYourSong.replace('{name}', name).replace('{title}', song.title).replace('{votes}', song.votes), 'info', 4500);
      });
    });
    return unsubscribe;
  }, [userId, t, toast]);

  // Fallback: si el evento no llegó, la detección por delta en la cola avisa igualmente
  useEffect(() => {
    if (!userId) return;
    const now = Date.now();
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
  }, [activeQueue, userProposals, userId, t, toast]);

  useEffect(() => {
    if (!userId || !userData) return;
    const curProposals = userData.proposals || [];
    const curVotes = userData.votes || [];
    const prevState = lastVotesOrProposalsRef.current;
    if (!prevState) {
      lastVotesOrProposalsRef.current = { proposals: curProposals, votes: curVotes };
      return;
    }
    const now = Date.now();
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
  }, [userData, userId, activeQueue, catalog, t, toast]);

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

  // Última llamada: aviso 30 min antes del cierre (1:30)
  const closing = new Date(currentTime);
  closing.setHours(1, 30, 0, 0);
  if (currentTime > closing.getTime()) closing.setDate(closing.getDate() + 1);
  const minutesToClose = Math.round((closing.getTime() - currentTime) / 60000);
  const isLastCall = isBridgeActive && checkIsStaffHours() && minutesToClose > 0 && minutesToClose <= 30;

  useEffect(() => {
    if (isLastCall && !lastCallToastRef.current) {
      lastCallToastRef.current = true;
      toast(t.lastCallDesc, 'info', 8000);
    }
    if (!isLastCall) lastCallToastRef.current = false;
  }, [isLastCall, t, toast]);

  const isCatrina = theme === 'catrina';
  const baseBgClass = isCatrina ? 'bg-[#0f0d0a]' : 'bg-zinc-950';
  const mainTextClass = isCatrina ? 'text-[#f5ecd7]' : 'text-white';

  if (loading) {
    return (
      <div className={`min-h-screen ${baseBgClass} flex items-center justify-center`}>
        <span className={isCatrina ? 'text-brand-gold font-display tracking-widest' : 'text-brand-gold'}>{t.loading}</span>
      </div>
    );
  }

  const topSongId = queueSongs.length > 0 ? queueSongs[0].id : null;

  return (
    <div className={`min-h-screen pb-24 font-sans selection:bg-brand-neon-purple/30 jukebox-bg relative ${baseBgClass}`}>
      <TextureOverlay />
      {themeSwitching && <div className="theme-transition-overlay" />}

      {/* ===== HEADER ===== */}
      <header className="jukebox-header">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => { if (isRegistered) setShowProfile(true); else { setAuthMode('login'); setShowLogin(true); } }}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 -ml-2 transition-colors ${isRegistered ? 'text-brand-gold' : isCatrina ? 'text-brand-gold/60 hover:text-brand-gold' : 'text-white/70 hover:text-brand-neon-purple'}`}
            title={isRegistered ? t.profileTitle : t.loginShort}
          >
            {isRegistered ? <Trophy size={22} /> : <LogIn size={22} />}
            <span className="text-[9px] font-bold uppercase tracking-wider">
              {isRegistered ? t.profileShort : t.loginShort}
            </span>
          </button>

          <button
            onClick={() => setShowStats(true)}
            className="text-brand-gold hover:text-white transition-colors p-2"
            title={t.statsTitle}
          >
            <BarChart3 size={24} />
          </button>

          <div className="flex flex-col items-center text-center min-w-0">
            <h1 className={`font-serif text-xl sm:text-3xl font-black text-brand-gold uppercase leading-tight truncate w-full ${isCatrina ? 'jukebox-logo' : 'tracking-widest'}`}>
              La Catrina
            </h1>
            <h2 className={`font-script text-lg sm:text-2xl text-brand-gold-dark -mt-1 sm:-mt-2 truncate w-full ${isCatrina ? 'jukebox-logo-sub' : ''}`}>
              {t.subtitle}
            </h2>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleToggleTheme}
              disabled={themeSwitching}
              className="jukebox-theme-toggle"
              title={isCatrina ? t.themeClassic : t.themeNeon}
              aria-label={isCatrina ? t.themeClassic : t.themeNeon}
              aria-busy={themeSwitching}
            >
              <span className="jukebox-theme-toggle-label jukebox-theme-toggle-label-c">C</span>
              <span className="jukebox-theme-toggle-label jukebox-theme-toggle-label-n">N</span>
              {themeSwitching ? (
                <Loader2 size={16} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-gold animate-spin" />
              ) : (
                <div className="jukebox-theme-toggle-knob" />
              )}
            </button>
            <button
              onClick={() => setLang('es')}
              className={`text-lg sm:text-xl transition-opacity ${lang === 'es' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
              title="Español"
            >
              ESP
            </button>
            <button
              onClick={() => setLang('en')}
              className={`text-lg sm:text-xl transition-opacity ${lang === 'en' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
              title="English"
            >
              ENG
            </button>
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="p-4 space-y-6 max-w-lg mx-auto">
        <button
          onClick={() => { setHelpStep(0); setShowHelp(true); }}
          className={`w-full flex items-center justify-center gap-2 py-2 transition-colors text-sm font-medium ${isCatrina ? 'text-brand-gold/30 hover:text-brand-gold' : 'text-zinc-500 hover:text-brand-neon-purple'}`}
        >
          <HelpCircle size={18} />
          {t.howItWorks}
        </button>

        {isLastCall && showLastCall && (
          <div className={`flex items-start gap-3 p-3 rounded-xl border ${isCatrina ? 'bg-[#1a120a] border-brand-gold/40' : 'bg-brand-gold/10 border-brand-gold/50'} shadow-[0_0_20px_rgba(204,165,63,0.15)]`}>
            <span className="text-2xl leading-none">⏰</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-brand-gold">{t.lastCallTitle}</p>
              <p className={`text-xs mt-0.5 ${isCatrina ? 'text-brand-gold/60' : 'text-zinc-400'}`}>{t.lastCallDesc}</p>
            </div>
            <button onClick={() => setShowLastCall(false)} className={`p-1 shrink-0 transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold' : 'text-zinc-500 hover:text-white'}`}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* ===== NOW PLAYING ===== */}
        <section ref={npCardRef} className="jukebox-np">
          {!isCatrina && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-neon-purple/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
          )}
          {isCatrina && (
            <>
              <CornerFlourish position="tl" size={36} />
              <CornerFlourish position="tr" size={36} />
              <CornerFlourish position="bl" size={36} />
              <CornerFlourish position="br" size={36} />
            </>
          )}

          <div className={`jukebox-np-label ${isCatrina ? 'relative z-[1]' : ''}`}>
            <Music2 size={16} className={isBridgeActive ? "animate-pulse" : ""} />
            {t.nowPlaying}
          </div>

          {isBridgeActive ? (
            <div className={isCatrina ? 'relative z-[1]' : ''}>
              <h3 className={`text-xl font-bold mb-2 line-clamp-2 leading-tight ${mainTextClass}`}>
                {nowPlaying?.title || t.autoMode}
              </h3>

              <div ref={discRef} className={`mx-auto my-4 ${isCatrina ? 'jukebox-np-disc' : 'text-brand-neon-purple opacity-80'}`}>
                <Disc3 size={isCatrina ? 56 : 48} />
              </div>

              <div className="space-y-2 text-left">
                <div className="jukebox-np-bar">
                  <div
                    className="jukebox-np-bar-fill"
                    style={{ width: `${calculateProgress()}%` }}
                  />
                </div>
                <div className={`flex justify-between text-xs font-medium ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-500'}`}>
                  <span>{nowPlaying ? formatTime(nowPlaying.currentTime) : '00:00'}</span>
                  <span>{nowPlaying ? formatTime(nowPlaying.totalTime) : '00:00'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className={`py-4 ${isCatrina ? 'relative z-[1]' : ''}`}>
              {checkIsStaffHours() ? (
                <>
                  <h3 className={`text-xl font-bold mb-2 ${mainTextClass}`}>{t.staffModeTitle}</h3>
                  <p className={isCatrina ? 'text-brand-gold/40 text-sm' : 'text-zinc-400 text-sm'}>{t.staffModeDesc}</p>
                </>
              ) : (
                <>
                  <h3 className={`text-xl font-bold mb-2 ${mainTextClass}`}>{t.closedTitle}</h3>
                  <p className={isCatrina ? 'text-brand-gold/40 text-sm' : 'text-zinc-400 text-sm'}>{t.closedDesc}</p>
                </>
              )}
            </div>
          )}
        </section>

        {nightlyTop && (
          <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${isCatrina ? 'bg-brand-gold/5 border-brand-gold/25' : 'bg-brand-neon-purple/10 border-brand-neon-purple/30'}`}>
            <Crown size={18} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
            <p className={`text-sm font-bold ${mainTextClass}`}>{t.djOfNight}:</p>
            <p className={`text-sm font-bold truncate ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>{nightlyTop.name}</p>
            <span className={`text-xs font-bold shrink-0 ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-500'}`}>({nightlyTop.points} {t.points})</span>
          </div>
        )}

        {isCatrina && <OrnamentalDivider />}

        {/* ===== STICKY COUNTERS + SEARCH + QUEUE ===== */}
        <div className={`sticky top-[100px] z-40 space-y-4 pb-4 border-b ${isCatrina ? 'border-brand-gold/10 shadow-2xl' : 'border-zinc-800/50 shadow-2xl'} ${baseBgClass}`}>
          <div ref={countersRef} className="flex gap-2">
            <div className={`jukebox-counter ${userProposals.length < 3 ? 'jukebox-counter-proposals' : 'jukebox-counter-spent'}`}>
              {t.proposalsLabel}: {userProposals.length}/{MAX_PROPOSALS}
            </div>
            <div className={`jukebox-counter ${userVotes.length < MAX_VOTES ? 'jukebox-counter-votes' : 'jukebox-counter-spent'}`}>
              {t.votesLabel}: {userVotes.length}/{MAX_VOTES}
            </div>
          </div>

          <div className="relative">
            <Search className="jukebox-search-icon" size={20} />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-10 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 transition-all ${isCatrina ? 'jukebox-search' : 'focus:border-brand-neon-purple focus:ring-brand-neon-purple'}`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-400 p-1"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {queueSongs.length > 0 && (
            <div className={`jukebox-queue ${isCatrina ? 'relative' : ''}`}>
              {isCatrina && (
                <>
                  <CornerFlourish position="tl" size={24} />
                  <CornerFlourish position="tr" size={24} />
                </>
              )}
              <div
                onClick={() => setIsQueueCollapsed(!isQueueCollapsed)}
                className="jukebox-queue-header"
              >
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>{t.nextInQueue}</span>
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
                    <span className={`text-[10px] font-bold ${isCatrina ? 'text-brand-gold/50' : 'text-brand-neon-purple/70'}`}>{activeUsersCount}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${isCatrina ? 'text-brand-gold/50' : 'text-brand-neon-purple/70'}`}>{queueSongs.length}</span>
                  {isQueueCollapsed ? <ChevronDown size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} /> : <ChevronUp size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />}
                </div>
              </div>
              {!isQueueCollapsed && (
                <div className={`max-h-[35vh] overflow-y-auto custom-scrollbar ${isCatrina ? 'divide-y divide-white/[0.03]' : 'divide-y divide-zinc-800/50'}`}>
                  {queueSongs.map((song) => {
                    const isTop = song.id === topSongId;
                    const isNowPlaying = nowPlaying?.title === song.title;
                    const limitReached = userVotes.length >= MAX_VOTES;
                    const hasVoted = userVotes.includes(song.id);
                    const hasProposed = userProposals.includes(song.id);
                    const songCooldown = cooldowns[song.id];
                    const isCoolingDown = songCooldown && (currentTimestamp - songCooldown < 3600000);
                    const minutesLeft = isCoolingDown ? Math.ceil((3600000 - (currentTimestamp - songCooldown)) / 60000) : 0;

                    return (
                      <div
                        key={`queue-${song.id}`}
                        data-reveal
                        className={`queue-reveal-item jukebox-queue-item ${isTop ? 'jukebox-queue-item-top' : 'bg-transparent hover:bg-white/5'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold truncate ${mainTextClass}`}>
                            {song.title}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Flame size={12} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
                            <span
                              ref={(node) => node ? voteCountRefs.current.set(song.id, node) : voteCountRefs.current.delete(song.id)}
                              className={`text-xs font-medium ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} ${lastVotedSongId === song.id ? 'vote-count-pop' : ''}`}
                            >
                              {song.votes} {song.votes === 1 ? t.vote : t.votes}
                            </span>
                          </div>
                          {song.proposerName && (
                            <span className={`block text-[10px] mt-0.5 ${isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}`}>
                              {t.proposedBy}{song.proposerName}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => toggleFavorite(song.id)}
                          className={`shrink-0 p-1.5 transition-all ${favorites.includes(song.id) ? 'text-red-500' : isCatrina ? 'text-brand-gold/25 hover:text-brand-gold' : 'text-zinc-600 hover:text-red-400'}`}
                          title={favorites.includes(song.id) ? t.removeFromFavorites : t.addToFavorites}
                        >
                          <Heart size={16} className={favorites.includes(song.id) ? 'fill-current' : ''} />
                        </button>

                        {(hasVoted || hasProposed) && (
                          <button
                            onClick={() => handleRemoveAction(song.id)}
                            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}

                        <button
                          ref={(node) => node ? voteButtonRefs.current.set(song.id, node) : voteButtonRefs.current.delete(song.id)}
                          onClick={() => handleVote(song)}
                          disabled={isNowPlaying || limitReached || !isBridgeActive || isCoolingDown}
                          className={`jukebox-btn-vote ${lastVotedSongId === song.id ? 'vote-pop' : ''} ${isNowPlaying || !isBridgeActive || isCoolingDown || limitReached ? 'jukebox-btn-vote-disabled' : 'jukebox-btn-vote-active'}`}
                        >
                          {isNowPlaying
                            ? t.nowPlayingBtn
                            : isCoolingDown
                              ? `${minutesLeft} ${t.cooldown}`
                              : t.voteButton}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {(activityEvents.length > 0 || playedHistory.length > 0) && (
          <section className={`rounded-2xl border p-4 space-y-3 ${isCatrina ? 'relative border-brand-gold/15' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 bg-current" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
              </span>
              {t.activityTitle}
            </div>

            {playedHistory.length > 0 && (
              <div>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}`}>{t.lastPlayedTitle}</p>
                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                  {playedHistory.map((p, i) => (
                    <span key={`${p.title}-${i}`} className={`shrink-0 text-[10px] px-2 py-1 rounded-full border ${isCatrina ? 'border-brand-gold/20 text-brand-gold/70' : 'border-zinc-700 text-zinc-400'}`}>
                      {p.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activityEvents.length > 0 ? (
              <div className="space-y-2">
                {activityEvents.map((e, i) => (
                  <div key={`${e.title}-${e.ts}-${i}`} className="flex items-center gap-2 text-xs">
                    <span className="shrink-0">{e.type === 'proposal' ? '🎵' : '🗳️'}</span>
                    <span className={`flex-1 min-w-0 truncate ${isCatrina ? 'text-brand-gold/70' : 'text-zinc-300'}`}>
                      {e.type === 'proposal'
                        ? t.activityProposed.replace('{name}', e.name).replace('{title}', e.title)
                        : t.activityVoted.replace('{name}', e.name).replace('{title}', e.title)}
                    </span>
                    <span className={`shrink-0 text-[10px] ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>
                      {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-xs ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>{t.noActivity}</p>
            )}
          </section>
        )}

        {isCatrina && <OrnamentalDivider />}

        {/* ===== CATALOG ===== */}
        <section className="space-y-3 pt-2">
          <SectionHeader label={t.songCatalog} />

          <div className="flex gap-2">
            {[
              { id: 'all', label: t.allTab },
              { id: 'favorites', label: `♥ ${t.favoritesTab}` },
              { id: 'mine', label: t.mySongsTab },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setCatalogFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
                  catalogFilter === f.id
                    ? isCatrina ? 'bg-brand-gold/15 border-brand-gold/50 text-brand-gold' : 'bg-brand-neon-purple/15 border-brand-neon-purple/50 text-brand-neon-purple'
                    : isCatrina ? 'border-brand-gold/15 text-brand-gold/40 hover:text-brand-gold' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredCatalog.length === 0 ? (
            catalogFilter !== 'all' && searchTerm === '' ? (
              <p className={`text-center py-10 text-sm ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>
                {catalogFilter === 'favorites' ? t.favoritesEmpty : t.mySongsEmpty}
              </p>
            ) : searchTerm !== '' ? (
              <div className={`jukebox-suggest-card ${isCatrina ? '' : 'bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4'}`}>
                <div className="flex justify-center">
                  <Music2 size={40} className={isCatrina ? 'text-brand-gold/20' : 'text-zinc-700'} />
                </div>
                <div className="space-y-2">
                  <h3 className={`text-lg font-bold ${mainTextClass}`}>{t.suggestTitle}</h3>
                  <p className={isCatrina ? 'text-brand-gold/40 text-sm' : 'text-zinc-400 text-sm'}>{t.suggestYoutubeNotice}</p>
                </div>

                <div className="space-y-3 text-left">
                  <input
                    type="text"
                    placeholder={t.suggestSongPlaceholder}
                    value={suggestTitle || searchTerm}
                    onChange={(e) => setSuggestTitle(e.target.value)}
                    className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white text-sm focus:border-brand-neon-purple focus:outline-none transition-all'}
                  />
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={t.suggestYoutubeUrlPlaceholder}
                      value={suggestYoutubeUrl}
                      onChange={(e) => setSuggestYoutubeUrl(e.target.value)}
                      className={isCatrina ? 'jukebox-input pr-10' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 pr-10 text-white text-sm focus:border-brand-neon-purple focus:outline-none transition-all'}
                    />
                    {validateYoutubeUrl(suggestYoutubeUrl) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-neon-green">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(suggestTitle || searchTerm)} videoclip`, '_blank')}
                    className={`w-full py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${isCatrina ? 'border-brand-gold/25 text-brand-gold hover:bg-brand-gold/8' : 'border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10'}`}
                  >
                    <Search size={14} />
                    {t.suggestSearchYoutube}
                  </button>
                </div>

                <button
                  onClick={handleSuggest}
                  disabled={!isBridgeActive || !validateYoutubeUrl(suggestYoutubeUrl)}
                  className={`w-full py-4 rounded-xl font-bold transition-all ${
                    suggested
                      ? 'bg-brand-neon-green/20 text-brand-neon-green'
                      : !isBridgeActive || !validateYoutubeUrl(suggestYoutubeUrl)
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : isCatrina
                          ? 'jukebox-btn-primary'
                          : 'bg-brand-gold text-zinc-950 hover:scale-[1.02] active:scale-95'
                  }`}
                >
                  {suggested ? t.suggestSuccess : t.suggestButton}
                </button>
              </div>
            ) : (
              <p className={`text-center py-10 ${isCatrina ? 'text-brand-gold/15' : 'text-zinc-600'}`}>{t.noResults}</p>
            )
          ) : (
            <div>
            {filteredCatalog.map((song) => {
              const isNowPlaying = nowPlaying?.title === song.title;
              const limitReached = userProposals.length >= MAX_PROPOSALS;
              const songCooldown = cooldowns[song.id];
              const isCoolingDown = songCooldown && (currentTimestamp - songCooldown < 3600000);
              const minutesLeft = isCoolingDown ? Math.ceil((3600000 - (currentTimestamp - songCooldown)) / 60000) : 0;

              return (
                <div
                  key={song.id}
                  data-reveal
                  className={`catalog-reveal-item flex items-center gap-3 p-3 transition-colors ${isCatrina ? 'jukebox-catalog-item hover:bg-brand-gold/5' : 'rounded-xl bg-transparent hover:bg-zinc-900 border border-transparent hover:border-zinc-800'}`}
                >
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${mainTextClass}`}>
                      {song.title}
                    </h4>
                    <span className={isCatrina ? 'text-brand-gold/25 text-xs' : 'text-zinc-600 text-xs'}>
                      {t.noVotes}
                    </span>
                  </div>

                  <button
                    onClick={() => toggleFavorite(song.id)}
                    className={`p-2 transition-all shrink-0 ${favorites.includes(song.id) ? 'text-red-500' : isCatrina ? 'text-brand-gold/30 hover:text-brand-gold' : 'text-zinc-600 hover:text-red-400'}`}
                    title={favorites.includes(song.id) ? t.removeFromFavorites : t.addToFavorites}
                  >
                    <Heart size={18} className={favorites.includes(song.id) ? 'fill-current' : ''} />
                  </button>

                  <button
                    ref={(node) => node ? voteButtonRefs.current.set(song.id, node) : voteButtonRefs.current.delete(song.id)}
                    onClick={() => handleVote(song)}
                    disabled={isNowPlaying || limitReached || !isBridgeActive || isCoolingDown}
                    className={`jukebox-btn-add ${isNowPlaying || !isBridgeActive || isCoolingDown || limitReached ? 'jukebox-btn-add-disabled' : 'jukebox-btn-add-active'}`}
                  >
                    {!isNowPlaying && !limitReached && !isCoolingDown && isBridgeActive && <Plus size={16} className="mr-1" />}
                    {isNowPlaying
                      ? t.nowPlayingBtn
                      : isCoolingDown
                        ? `${minutesLeft} ${t.cooldown}`
                        : t.add}
                  </button>
                </div>
              );
            })
            }
            </div>
          )}
        </section>
      </main>

      {/* ===== HELP MODAL ===== */}
      {showHelp && (
        <div className="jukebox-modal-overlay">
          <div className="jukebox-modal">
            {isCatrina && (
              <>
                <CornerFlourish position="tl" size={28} />
                <CornerFlourish position="tr" size={28} />
                <CornerFlourish position="bl" size={28} />
                <CornerFlourish position="br" size={28} />
              </>
            )}
            <button onClick={() => setShowHelp(false)} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}>
              <X size={24} />
            </button>

            <div className={`text-center space-y-6 ${isCatrina ? 'relative z-[1]' : ''}`}>
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 ${isCatrina ? 'jukebox-help-step-indicator' : 'bg-brand-gold/10 text-brand-gold'}`}>
                <span className={`text-2xl font-black ${!isCatrina ? 'text-brand-gold' : ''}`}>{helpStep + 1}</span>
              </div>

              <div>
                <h2 className={`text-2xl font-bold mb-3 ${mainTextClass}`}>
                  {t.helpSteps[helpStep].title}
                </h2>
                <p className={isCatrina ? 'text-brand-gold/50 leading-relaxed' : 'text-zinc-400 leading-relaxed'}>
                  {t.helpSteps[helpStep].text}
                </p>
              </div>

              <div className="flex gap-2 justify-center">
                {[0, 1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className="jukebox-help-dot"
                    style={{
                      height: '6px',
                      width: '32px',
                      borderRadius: '9999px',
                      transition: 'background-color 0.3s',
                      backgroundColor: s === helpStep
                        ? (isCatrina ? 'var(--catrina-gold)' : '#cca53f')
                        : (isCatrina ? 'rgba(255,255,255,0.06)' : '#27272a'),
                    }}
                  />
                ))}
              </div>

              <button
                onClick={() => {
                  if (helpStep < 3) setHelpStep(helpStep + 1);
                  else setShowHelp(false);
                }}
                className={`w-full font-bold py-4 transition-all ${isCatrina ? 'jukebox-btn-primary rounded-sm' : 'bg-brand-gold text-zinc-950 rounded-2xl hover:scale-[1.02] active:scale-95'}`}
              >
                {helpStep < 3 ? t.next : t.finish}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== SCROLL TO TOP ===== */}
      {showScroll && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={isCatrina ? 'jukebox-scroll-top' : 'fixed bottom-6 right-6 z-50 w-12 h-12 bg-zinc-900 border border-brand-neon-purple text-brand-neon-purple rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(176,38,255,0.5)] transition-all hover:scale-110 active:scale-95'}
        >
          <ArrowUp size={24} />
        </button>
      )}

      {/* ===== STATS MODAL ===== */}
      {showStats && (
        <Suspense fallback={null}>
          <StatsModal
            onClose={() => setShowStats(false)}
            t={t}
            catalog={catalog}
            isCatrina={isCatrina}
            mainTextClass={mainTextClass}
          />
        </Suspense>
      )}

      {/* ===== PLAYING BANNER ===== */}
      {showPlayingBanner && playingBannerData && (
        <div className={isCatrina ? 'jukebox-playing-banner' : 'fixed top-16 left-0 right-0 z-[90] flex justify-center px-4 animate-bounce'}>
          <div className={isCatrina
            ? 'px-6 py-4 max-w-sm w-full text-center'
            : 'bg-gradient-to-r from-brand-neon-purple/20 to-brand-neon-green/20 border border-brand-neon-purple/40 rounded-2xl px-6 py-4 max-w-sm w-full text-center shadow-[0_0_30px_rgba(176,38,255,0.2)]'
          }>
            <p className={`font-bold text-sm flex items-center justify-center gap-2 ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-green'}`}>
              <Disc3 size={18} className="animate-spin" /> {t.yourSongPlaying}
            </p>
            <p className={`font-bold text-lg mt-1 truncate ${mainTextClass}`}>{playingBannerData.title}</p>
            <p className={`text-xs mt-1 ${isCatrina ? 'text-brand-gold/60' : 'text-brand-gold'}`}>
              {playingBannerData.isProposed ? t.proposedByYou : t.votedByYou}
            </p>
          </div>
        </div>
      )}

      {/* ===== REGISTER / LOGIN MODAL ===== */}
      {(showRegister || showLogin) && (
        <div className="jukebox-modal-overlay">
          <div className="jukebox-modal">
            {isCatrina && (
              <>
                <CornerFlourish position="tl" size={28} />
                <CornerFlourish position="tr" size={28} />
              </>
            )}
            <button onClick={() => { setShowRegister(false); setShowLogin(false); }} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}>
              <X size={24} />
            </button>
            <div className={`text-center mb-6 ${isCatrina ? 'relative z-[1]' : ''}`}>
              <div className="text-5xl mb-2">{isCatrina ? '\uD83C\uDFB8' : '\uD83C\uDFA7'}</div>
              <h2 className={`text-2xl font-bold uppercase tracking-wider ${isCatrina ? 'jukebox-section-title' : 'text-brand-gold'}`}>
                {authMode === 'register' ? t.registerTitle : t.loginTitle}
              </h2>
              <p className={`text-sm mt-2 ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-400'}`}>{authMode === 'register' ? t.registerDesc : t.loginDesc}</p>
              {authMode === 'register' && (
                <div className={`mt-4 text-left space-y-1.5 ${isCatrina ? 'relative z-[1]' : ''}`}>
                  {t.registerBenefits.map((b, i) => (
                    <div key={i} className={`flex items-start gap-2 text-xs leading-snug ${isCatrina ? 'text-brand-gold/60' : 'text-zinc-300'}`}>
                      <span className={`mt-0.5 shrink-0 font-bold ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-green'}`}>✓</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={authMode === 'register' ? handleRegister : handleLogin} className={`space-y-4 ${isCatrina ? 'relative z-[1]' : ''}`}>
              {authMode === 'register' && (
                <div className="space-y-1">
                  <input type="text" placeholder={t.registerDjName} value={regDjName} onChange={(e) => setRegDjName(e.target.value)} required maxLength={20} autoFocus
                    className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all'} />
                  <p className={`text-[11px] px-1 ${isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}`}>{t.registerDjNameHelp}</p>
                </div>
              )}
              <input type="email" placeholder={t.registerEmail} value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required
                className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all'} />
              <input type="password" placeholder={t.registerPassword} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={6}
                className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all'} />
              {authErrorMsg && <p className="text-red-400 text-sm text-center">{authErrorMsg}</p>}
              <button type="submit" className={`w-full text-white font-bold py-3 transition-all active:scale-[0.98] ${isCatrina ? 'jukebox-btn-primary' : 'bg-gradient-to-r from-brand-neon-purple to-brand-neon-green rounded-xl hover:opacity-90'}`}>
                {authMode === 'register' ? t.registerButton : t.loginButton}
              </button>
            </form>
            {authMode === 'login' && (
              <button
                onClick={handleForgotPassword}
                className={`w-full text-center text-xs mt-3 underline transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t.forgotPassword}
              </button>
            )}
            <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthErrorMsg(''); }}
              className={`w-full text-center text-sm mt-4 transition-colors ${isCatrina ? 'text-brand-gold/50 hover:text-brand-gold' : 'text-zinc-500 hover:text-brand-gold'}`}>
              {authMode === 'register' ? t.loginLink : t.registerLink}
            </button>
            <button onClick={() => { setShowRegister(false); setShowLogin(false); }}
              className={`w-full text-center text-xs mt-2 ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>{t.backToGuest}</button>
            <div className={`mt-6 ${isCatrina ? 'jukebox-privacy' : 'p-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-[11px] text-zinc-500 text-center leading-relaxed'}`}>
              {t.privacyNotice}
            </div>
          </div>
        </div>
      )}

      {/* ===== OUT OF TOKENS CTA ===== */}
      {showOutTokenCTA && !isRegistered && (
        <div className="jukebox-modal-overlay">
          <div className={`jukebox-modal text-center ${isCatrina ? '' : ''}`}>
            {isCatrina && (
              <>
                <CornerFlourish position="tl" size={28} />
                <CornerFlourish position="tr" size={28} />
                <CornerFlourish position="bl" size={28} />
                <CornerFlourish position="br" size={28} />
              </>
            )}
            <div className={`text-5xl mb-3 ${isCatrina ? 'relative z-[1]' : ''}`}>{isCatrina ? '\uD83C\uDFB6' : '\uD83C\uDFA4'}</div>
            <h2 className={`text-xl font-bold uppercase tracking-wider mb-3 ${isCatrina ? 'jukebox-section-title relative z-[1]' : 'text-brand-gold'}`}>{t.outOfTokensTitle}</h2>
            <p className={`text-sm leading-relaxed mb-2 ${isCatrina ? 'text-brand-gold/50 relative z-[1]' : 'text-zinc-400'}`}>{t.outOfTokensDesc}</p>
            <div className={`mt-4 ${isCatrina ? 'jukebox-privacy relative z-[1]' : 'p-3 bg-zinc-950/50 rounded-xl border border-zinc-800'}`}>
              <p className={isCatrina ? '' : 'text-[11px] text-zinc-500 leading-relaxed'}>{t.privacyNotice}</p>
            </div>
            <button onClick={() => { setShowOutTokenCTA(false); setAuthMode('register'); setShowRegister(true); }}
              className={`mt-6 w-full text-white font-bold py-3 transition-all active:scale-[0.98] ${isCatrina ? 'jukebox-btn-primary relative z-[1]' : 'bg-gradient-to-r from-brand-neon-purple to-brand-neon-green rounded-xl hover:opacity-90'}`}>
              {t.registerCta}
            </button>
            <button onClick={() => setShowOutTokenCTA(false)} className={`mt-3 text-sm transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold relative z-[1]' : 'text-zinc-500 hover:text-zinc-300'}`}>{t.maybeLater}</button>
          </div>
        </div>
      )}

      {/* ===== PROFILE ===== */}
      {showDesignSurvey && (
        <div className="jukebox-modal-overlay" style={{ zIndex: 150 }}>
          <div className="jukebox-modal text-center">
            {isCatrina && (
              <>
                <CornerFlourish position="tl" size={28} />
                <CornerFlourish position="tr" size={28} />
                <CornerFlourish position="bl" size={28} />
                <CornerFlourish position="br" size={28} />
              </>
            )}
            <button onClick={dismissSurvey} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}>
              <X size={24} />
            </button>

            {!surveySubmitted ? (
              <div className={`space-y-6 ${isCatrina ? 'relative z-[1]' : ''}`}>
                <div className="text-5xl mb-2">🎨</div>
                <h2 className={`text-xl font-bold ${isCatrina ? 'jukebox-section-title' : 'text-brand-gold'}`}>
                  {t.surveyTitle}
                </h2>
                <p className={`text-sm leading-relaxed ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-400'}`}>
                  {t.surveyDesc}
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => submitDesignSurvey('new')}
                    className={`w-full py-3 font-bold transition-all active:scale-[0.98] ${isCatrina ? 'jukebox-btn-primary' : 'bg-gradient-to-r from-brand-neon-purple to-brand-neon-green text-white rounded-xl hover:opacity-90'}`}
                  >
                    {t.surveyNew}
                  </button>
                  <button
                    onClick={() => submitDesignSurvey('old')}
                    className={`w-full py-3 rounded-xl font-bold transition-all ${isCatrina ? 'border border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10' : 'border border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10'}`}
                  >
                    {t.surveyClassic}
                  </button>
                </div>
                <button onClick={dismissSurvey} className={`text-xs transition-colors ${isCatrina ? 'text-brand-gold/30 hover:text-brand-gold' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {t.surveySkip}
                </button>
              </div>
            ) : (
              <div className={`space-y-4 ${isCatrina ? 'relative z-[1]' : ''}`}>
                <div className="text-5xl">✅</div>
                <h2 className={`text-xl font-bold ${isCatrina ? 'text-brand-gold' : 'text-brand-gold'}`}>
                  {t.surveyThanks}
                </h2>
                <p className={`text-sm ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-400'}`}>
                  {t.surveyThanksDesc}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showProfile && (
        <Suspense fallback={null}>
          <Profile
            userData={userData}
            userId={userId}
            t={t}
            activeQueue={activeQueue}
            onClose={() => setShowProfile(false)}
            onLogout={handleLogout}
          />
        </Suspense>
      )}
    </div>
  );
}

