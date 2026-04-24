import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, getDoc, setDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, Flame, Plus, Music2, X, HelpCircle, ArrowUp, Disc3, BarChart3, ChevronUp, ChevronDown, Trash2, Users } from 'lucide-react';
import { db, auth } from './firebase';
import { translations } from './translations';

export default function App() {
  const [catalog, setCatalog] = useState([]);
  const [activeQueue, setActiveQueue] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProposals, setUserProposals] = useState([]);
  const [userVotes, setUserVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cooldowns, setCooldowns] = useState({});
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es');
  const [showHelp, setShowHelp] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [showScroll, setShowScroll] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [activeUsersCount, setActiveUsersCount] = useState(0);

  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScroll(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auth Effect
  useEffect(() => {
    let unsubUser = null;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (user) {
        setUserId(user.uid);
        const userRef = doc(db, 'users', user.uid);
        
        const userDoc = await getDoc(userRef);
        if(!userDoc.exists()){
          await setDoc(userRef, { proposals: [], votes: [] });
        }

        unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProposals(data.proposals || []);
            setUserVotes(data.votes || []);
          }
        });
      } else {
        setUserId(null);
        setUserProposals([]);
        setUserVotes([]);
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
      if (docSnap.exists()) {
        setNowPlaying(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const cooldownsRef = doc(db, 'state', 'cooldowns');
    const unsubscribe = onSnapshot(cooldownsRef, (docSnap) => {
      if (docSnap.exists()) {
        setCooldowns(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const catalogRef = doc(db, 'catalog', 'full_list');
    const unsubscribe = onSnapshot(catalogRef, (docSnap) => {
      if (docSnap.exists()) {
        setCatalog(docSnap.data().songs || []);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const songsRef = collection(db, 'songs');
    const unsubscribe = onSnapshot(songsRef, (snapshot) => {
      const queueMap = {};
      snapshot.docs.forEach(doc => {
        queueMap[doc.id] = doc.data();
      });
      setActiveQueue(queueMap);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const queueKeys = Object.keys(activeQueue);
    const count = allUsers.filter(user => {
      const hasActiveProposal = (user.proposals || []).some(id => queueKeys.includes(id));
      const hasActiveVote = (user.votes || []).some(id => queueKeys.includes(id));
      return hasActiveProposal || hasActiveVote;
    }).length;
    setActiveUsersCount(count);
  }, [allUsers, activeQueue]);

  const handleRemoveAction = async (songId, isProposal) => {
    if (!userId) return;

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
          await updateDoc(songRef, {
            votes: increment(-1)
          });
        }
        console.log("Acción deshecha con éxito");
      }
    } catch (error) {
      alert(t.firebaseError + error.message);
      console.error(error);
    }
  };

  const handleVote = async (song) => {
    if (!userId) {
      alert(t.authError);
      return;
    }

    const isProposal = song.votes === 0;

    if (isProposal) {
      if (userProposals.length >= 3) {
        alert(t.alreadyVoted);
        return;
      }
    } else {
      if (userVotes.length >= 5) {
        alert(t.alreadyVoted);
        return;
      }
    }

    try {
      const userRef = doc(db, 'users', userId);

      if (isProposal) {
        await setDoc(userRef, { proposals: [...userProposals, song.id] }, { merge: true });
      } else {
        await setDoc(userRef, { votes: [...userVotes, song.id] }, { merge: true });
      }

      const songRef = doc(db, 'songs', song.id);
      await setDoc(songRef, {
        title: song.title,
        votes: increment(1),
        firstVotedAt: isProposal ? Date.now() : (activeQueue[song.id]?.firstVotedAt || Date.now())
      }, { merge: true });

      const now = new Date();
      let hour = now.getHours();
      let day = now.getDay();

      if (hour < 2) {
        day = (day === 0) ? 6 : day - 1;
      }

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

      console.log("Acción registrada con éxito");
    } catch (error) {
      alert(t.firebaseError + error.message);
      console.error(error);
    }
  };

  const handleSuggest = async () => {
    if(!searchTerm || !userId) return;
    try {
      await addDoc(collection(db, 'suggestions'), {
        title: searchTerm,
        timestamp: Date.now(),
        userId
      });
      setSuggested(true);
      setTimeout(() => setSuggested(false), 3000);
    } catch (error) {
      console.error("Error sending suggestion:", error);
    }
  };

  const mergedSongs = catalog
    .map(song => ({
      ...song,
      votes: activeQueue[song.id]?.votes || 0,
      firstVotedAt: activeQueue[song.id]?.firstVotedAt || null
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
    .filter(song =>
      song.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
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

  const isBridgeActive = nowPlaying?.lastActive ? (currentTime - nowPlaying.lastActive < 300000) : false;

  const checkIsStaffHours = () => {
    const now = new Date(currentTime);
    const day = now.getDay();
    const time = now.getHours() + now.getMinutes() / 60;

    const isEveningOpen = day >= 1 && day <= 6 && time >= 19;
    const isMorningOpen = (day >= 2 || day === 0) && time <= 1.5;

    return isEveningOpen || isMorningOpen;
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-brand-gold">{t.loading}</div>;
  }

  const topSongId = queueSongs.length > 0 ? queueSongs[0].id : null;

  return (
    <div className="min-h-screen pb-24 bg-zinc-950 font-sans selection:bg-brand-neon-purple/30">
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-brand-gold/20 p-2 sm:p-4 shrink-0">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => setShowStats(true)}
            className="text-brand-gold hover:text-white transition-colors p-2"
            title={t.statsTitle}
          >
            <BarChart3 size={24} />
          </button>

          <div className="flex flex-col items-center text-center min-w-0">
            <h1 className="font-serif text-xl sm:text-3xl font-black text-brand-gold tracking-widest uppercase leading-tight truncate w-full">
              La Catrina
            </h1>
            <h2 className="font-script text-lg sm:text-2xl text-brand-gold-dark -mt-1 sm:-mt-2 truncate w-full">
              {t.subtitle}
            </h2>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setLang('es')}
              className={`text-lg sm:text-xl transition-opacity ${lang === 'es' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
              title="Español"
            >
              🇪🇸
            </button>
            <button
              onClick={() => setLang('en')}
              className={`text-lg sm:text-xl transition-opacity ${lang === 'en' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
              title="English"
            >
              🇺🇸
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-lg mx-auto">
        <button
          onClick={() => { setHelpStep(0); setShowHelp(true); }}
          className="w-full flex items-center justify-center gap-2 py-2 text-zinc-500 hover:text-brand-neon-purple transition-colors text-sm font-medium"
        >
          <HelpCircle size={18} />
          {t.howItWorks}
        </button>

        <section className="bg-zinc-900 border border-brand-neon-purple/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(176,38,255,0.15)] relative overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-neon-purple/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="flex items-center justify-center gap-2 text-brand-neon-purple font-semibold uppercase tracking-wider text-xs mb-3">
            <Music2 size={16} className={isBridgeActive ? "animate-pulse" : ""} />
            {t.nowPlaying}
          </div>
          
          {isBridgeActive ? (
            <>
              <h3 className="text-xl font-bold text-white mb-2 line-clamp-2 leading-tight">
                {nowPlaying?.title || t.autoMode}
              </h3>

              <Disc3 size={48} className="animate-[spin_4s_linear_infinite] text-brand-neon-purple mx-auto my-4 opacity-80" />

              <div className="space-y-2 text-left">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-neon-purple to-brand-neon-green rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${calculateProgress()}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-zinc-500 font-medium">
                  <span>{nowPlaying ? formatTime(nowPlaying.currentTime) : '00:00'}</span>
                  <span>{nowPlaying ? formatTime(nowPlaying.totalTime) : '00:00'}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="py-4">
              {checkIsStaffHours() ? (
                <>
                  <h3 className="text-xl font-bold text-white mb-2">{t.staffModeTitle}</h3>
                  <p className="text-zinc-400 text-sm">{t.staffModeDesc}</p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-white mb-2">{t.closedTitle}</h3>
                  <p className="text-zinc-400 text-sm">{t.closedDesc}</p>
                </>
              )}
            </div>
          )}
        </section>

        <div className="sticky top-[100px] z-40 bg-zinc-950 space-y-4 pb-4 border-b border-zinc-800/50 shadow-2xl">
          <div className="flex gap-2">
            <div className={`flex-1 rounded-xl p-3 text-center text-sm font-medium border shadow-lg transition-colors duration-300 ${
              userProposals.length < 3
                ? 'bg-brand-neon-green/10 border-brand-neon-green/30 text-brand-neon-green'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              {t.proposalsLabel}: {userProposals.length}/3
            </div>
            <div className={`flex-1 rounded-xl p-3 text-center text-sm font-medium border shadow-lg transition-colors duration-300 ${
              userVotes.length < 5
                ? 'bg-brand-neon-purple/10 border-brand-neon-purple/30 text-brand-neon-purple'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              {t.votesLabel}: {userVotes.length}/5
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-10 text-white placeholder-zinc-500 focus:outline-none focus:border-brand-neon-purple focus:ring-1 focus:ring-brand-neon-purple transition-all"
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
            <div className="bg-zinc-900/50 border border-brand-gold/20 rounded-2xl overflow-hidden shadow-inner">
              <div
                onClick={() => setIsQueueCollapsed(!isQueueCollapsed)}
                className="bg-brand-gold/10 px-4 py-2 border-b border-brand-gold/20 flex justify-between items-center cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em]">{t.nextInQueue}</span>
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-brand-gold" />
                    <span className="text-[10px] font-bold text-brand-gold/60">{activeUsersCount}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-brand-gold/60">{queueSongs.length}</span>
                  {isQueueCollapsed ? <ChevronDown size={14} className="text-brand-gold" /> : <ChevronUp size={14} className="text-brand-gold" />}
                </div>
              </div>
              {!isQueueCollapsed && (
                <div className="max-h-[35vh] overflow-y-auto custom-scrollbar divide-y divide-zinc-800/50">
                  {queueSongs.map((song) => {
                  const isTop = song.id === topSongId;
                  const isNowPlaying = nowPlaying?.title === song.title;
                  const limitReached = userVotes.length >= 5;
                  const hasVoted = userVotes.includes(song.id);
                  const hasProposed = userProposals.includes(song.id);

                  const songCooldown = cooldowns[song.id];
                  const isCoolingDown = songCooldown && (currentTime - songCooldown < 3600000);
                  const minutesLeft = isCoolingDown ? Math.ceil((3600000 - (currentTime - songCooldown)) / 60000) : 0;

                  return (
                    <div
                      key={`queue-${song.id}`}
                      className={`flex items-center gap-3 p-3 transition-colors ${
                        isTop ? 'bg-brand-gold/5' : 'bg-transparent hover:bg-white/5'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">
                          {song.title}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Flame size={12} className="text-brand-gold" />
                          <span className="text-xs text-brand-gold font-medium">
                            {song.votes} {song.votes === 1 ? t.vote : t.votes}
                          </span>
                        </div>
                      </div>

                      {(hasVoted || hasProposed) && (
                        <button
                          onClick={() => handleRemoveAction(song.id, hasProposed)}
                          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}

                      <button
                        onClick={() => handleVote(song)}
                        disabled={isNowPlaying || limitReached || !isBridgeActive || isCoolingDown}
                        className={`shrink-0 flex items-center justify-center h-8 px-3 rounded-lg font-bold text-xs transition-all ${
                          isNowPlaying || !isBridgeActive || isCoolingDown || limitReached
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : 'bg-brand-gold text-zinc-950 hover:bg-brand-gold-dark active:scale-95'
                        }`}
                      >
                        {isNowPlaying
                          ? t.nowPlayingBtn
                          : isCoolingDown
                            ? `⏳ ${minutesLeft}`
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

        <section className="space-y-3 pt-2">
          <div className="flex items-center gap-2 px-1 mb-4">
             <div className="h-px flex-1 bg-zinc-800"></div>
             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t.songCatalog}</span>
             <div className="h-px flex-1 bg-zinc-800"></div>
          </div>

          {filteredCatalog.length === 0 ? (
            searchTerm !== '' ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
                <div className="flex justify-center">
                  <Music2 size={48} className="text-zinc-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{t.suggestTitle}</h3>
                  <p className="text-zinc-400 text-sm">{t.suggestDesc}</p>
                  <p className="text-brand-gold italic mt-2">"{searchTerm}"</p>
                </div>
                <button
                  onClick={handleSuggest}
                  disabled={!isBridgeActive}
                  className={`w-full py-3 rounded-xl font-bold transition-all ${
                    suggested
                      ? 'bg-brand-neon-green/20 text-brand-neon-green'
                      : !isBridgeActive
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-zinc-800 text-white hover:bg-zinc-700'
                  }`}
                >
                  {suggested ? t.suggestSuccess : t.suggestButton}
                </button>
              </div>
            ) : (
              <p className="text-center text-zinc-600 py-10">{t.noResults}</p>
            )
          ) : (
            filteredCatalog.map((song) => {
              const isNowPlaying = nowPlaying?.title === song.title;
              const limitReached = userProposals.length >= 3;
              
              const songCooldown = cooldowns[song.id];
              const isCoolingDown = songCooldown && (currentTime - songCooldown < 3600000);
              const minutesLeft = isCoolingDown ? Math.ceil((3600000 - (currentTime - songCooldown)) / 60000) : 0;

              return (
                <div 
                  key={song.id} 
                  className="flex items-center gap-3 p-3 rounded-xl transition-colors bg-transparent hover:bg-zinc-900 border border-transparent hover:border-zinc-800"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">
                      {song.title}
                    </h4>
                    <span className="text-xs text-zinc-600">
                      {t.noVotes}
                    </span>
                  </div>

                  <button
                    onClick={() => handleVote(song)}
                    disabled={isNowPlaying || limitReached || !isBridgeActive || isCoolingDown}
                    className={`shrink-0 flex items-center justify-center h-10 px-4 rounded-lg font-medium text-sm transition-all ${
                      isNowPlaying || !isBridgeActive || isCoolingDown || limitReached
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-600'
                    }`}
                  >
                    {!isNowPlaying && !limitReached && !isCoolingDown && isBridgeActive && <Plus size={16} className="mr-1" />}
                    {isNowPlaying
                      ? t.nowPlayingBtn
                      : isCoolingDown
                        ? `⏳ ${minutesLeft} ${t.cooldown}`
                        : t.add}
                  </button>
                </div>
              );
            })
          )}
        </section>

      </main>

      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-brand-gold/30 rounded-3xl p-8 max-w-sm w-full shadow-[0_0_50px_rgba(255,204,0,0.1)] relative">
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white"
            >
              <X size={24} />
            </button>

            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-gold/10 text-brand-gold mb-2">
                <span className="text-2xl font-black">{helpStep + 1}</span>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  {t.helpSteps[helpStep].title}
                </h2>
                <p className="text-zinc-400 leading-relaxed">
                  {t.helpSteps[helpStep].text}
                </p>
              </div>

              <div className="flex gap-2 justify-center">
                {[0, 1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`h-1.5 w-8 rounded-full transition-colors ${s === helpStep ? 'bg-brand-gold' : 'bg-zinc-800'}`}
                  />
                ))}
              </div>

              <button
                onClick={() => {
                  if (helpStep < 3) {
                    setHelpStep(helpStep + 1);
                  } else {
                    setShowHelp(false);
                  }
                }}
                className="w-full bg-brand-gold text-zinc-950 font-bold py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all"
              >
                {helpStep < 3 ? t.next : t.finish}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScroll && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-zinc-900 border border-brand-neon-purple text-brand-neon-purple rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(176,38,255,0.5)] transition-all hover:scale-110 active:scale-95"
        >
          <ArrowUp size={24} />
        </button>
      )}
      {showStats && (
        <StatsModal
          onClose={() => setShowStats(false)}
          t={t}
          catalog={catalog}
        />
      )}
    </div>
  );
}

function StatsModal({ onClose, t, catalog }) {
  const [range, setRange] = useState('hoy'); 
  const [data, setData] = useState({ plays: {}, votes: {}, time: {}, playsTotal: {}, votesTotal: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const statsRef = collection(db, 'statistics');
        let baseDocs = [];

        if (range === 'cost') {
          baseDocs = ['plays_total', 'votes_total'];
        } else {
          baseDocs = [`plays_${range}`, `votes_${range}`];
          if (range === 'hoy' || range === 'semana') {
            baseDocs.push(`time_${range}`);
          }
        }

        const results = await Promise.all(
          baseDocs.map(id => getDoc(doc(statsRef, id)))
        );

        const newData = { plays: {}, votes: {}, time: {}, playsTotal: {}, votesTotal: {} };
        results.forEach((docSnap, index) => {
          if (docSnap.exists()) {
            const id = baseDocs[index];
            if (id === `plays_${range}`) newData.plays = docSnap.data();
            else if (id === `votes_${range}`) newData.votes = docSnap.data();
            else if (id === `time_${range}`) newData.time = docSnap.data();
            else if (id === 'plays_total') newData.playsTotal = docSnap.data();
            else if (id === 'votes_total') newData.votesTotal = docSnap.data();
          }
        });

        if (range === 'total' || range === 'cost') {
          newData.playsTotal = newData.playsTotal || newData.plays;
          newData.votesTotal = newData.votesTotal || newData.votes;
        }

        setData(newData);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
      setLoading(false);
    };

    fetchStats();
  }, [range]);

  const renderTopList = (statsMap, title) => {
    const sorted = Object.entries(statsMap)
      .map(([id, count]) => {
        const song = catalog.find(s => s.id === id);
        return { id, count, title: song ? song.title : id };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    if (sorted.length === 0) return null;

    const maxCount = sorted[0].count;

    return (
      <div className="space-y-4">
        <h3 className="text-brand-gold font-bold uppercase tracking-wider text-sm flex items-center gap-2">
          {title === 'plays' ? <Disc3 size={16} /> : <Flame size={16} />}
          {title === 'plays' ? t.statsPlays : t.statsVotes}
        </h3>
        <div className="space-y-3">
          {sorted.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-300">
                <span className="truncate pr-4">{item.title}</span>
                <span className="font-bold">{item.count}</span>
              </div>
              <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-neon-purple rounded-full"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTimeChart = () => {
    if (range !== 'hoy' && range !== 'semana') return null;

    const timeData = data.time;
    const isHoy = range === 'hoy';
    
    // HORAS REALES DE TU LOCAL: de 18:00 a 01:00
    const keys = isHoy
      ? ['18', '19', '20', '21', '22', '23', '0', '1']
      : Array.from({ length: 7 }, (_, i) => ((i + 1) % 7).toString());

    const maxCount = Math.max(...Object.values(timeData), 0) || 1;

    return (
      <div className="space-y-4">
        <h3 className="text-brand-gold font-bold uppercase tracking-wider text-sm">
          {isHoy ? t.statsTime : t.statsDays}
        </h3>
        <div className="flex items-end gap-1 h-32 pt-4">
          {keys.map(key => {
            const count = timeData[key] || 0;
            const height = (count / maxCount) * 100;
            return (
              <div key={key} className="flex-1 flex flex-col items-center gap-2 h-full">
                <div className="flex-1 w-full flex items-end">
                  <div
                    className="w-full bg-brand-neon-green/40 border-t border-brand-neon-green rounded-t-sm transition-all duration-500"
                    style={{ height: `${height}%` }}
                    title={`${count} votos`}
                  ></div>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {isHoy ? `${key}h` : t.daysShort[parseInt(key)]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAvgCostList = () => {
    if (!data.playsTotal || !data.votesTotal || Object.keys(data.playsTotal).length === 0) return null;

    const avgCosts = [];
    for (const [songId, plays] of Object.entries(data.playsTotal)) {
      if (plays >= 2) { // Filtramos para que hayan sonado mínimo 2 veces
        const votes = data.votesTotal[songId] || 0;
        const avg = votes / plays;
        const song = catalog.find(s => s.id === songId);
        avgCosts.push({
          id: songId,
          title: song ? song.title : songId,
          avg: avg
        });
      }
    }

    if (avgCosts.length === 0) return null;

    // Ordenar de mayor a menor coste
    avgCosts.sort((a, b) => b.avg - a.avg);
    const topAvgs = avgCosts.slice(0, 5);

    return (
      <div className="space-y-4">
        <h3 className="text-brand-gold font-bold uppercase tracking-wider text-sm flex items-center gap-2">
          <BarChart3 size={16} />
          {t.avgVoteCostTitle}
        </h3>
        <div className="space-y-3">
          {topAvgs.map((item) => (
            <div key={item.id} className="flex justify-between items-center p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
              <span className="truncate pr-4 text-sm font-medium text-white">{item.title}</span>
              <span className={`font-bold text-sm shrink-0 ${item.avg >= 2 ? 'text-brand-gold' : 'text-zinc-400'}`}>
                {item.avg.toFixed(1)}v
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] bg-zinc-950 flex flex-col">
      <header className="p-4 border-b border-brand-gold/20 flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand-gold flex items-center gap-2">
          <BarChart3 />
          {t.statsTitle}
        </h2>
        <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white">
          <X size={24} />
        </button>
      </header>

      <nav className="flex p-2 gap-1 bg-zinc-900 border-b border-zinc-800 overflow-x-auto custom-scrollbar">
        {[
          { id: 'hoy', label: t.statsToday },
          { id: 'semana', label: t.statsWeek },
          { id: 'mes', label: t.statsMonth },
          { id: 'total', label: t.statsTotal },
          { id: 'cost', label: t.statsCost }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setRange(tab.id)}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              range === tab.id
                ? 'bg-brand-gold text-zinc-950'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-6 space-y-10">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-brand-gold animate-pulse">
            {t.loading}
          </div>
        ) : (
          <>
            {range === 'cost' ? (
              renderAvgCostList() || (
                <div className="text-center py-20 text-zinc-600">
                  <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
                  <p>{t.noStats}</p>
                </div>
              )
            ) : (
              <>
                {Object.keys(data.plays).length === 0 && Object.keys(data.votes).length === 0 ? (
                  <div className="text-center py-20 text-zinc-600">
                    <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
                    <p>{t.noStats}</p>
                  </div>
                ) : (
                  <>
                    {renderTimeChart()}
                    {renderTopList(data.votes, 'votes')}
                    {renderTopList(data.plays, 'plays')}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
