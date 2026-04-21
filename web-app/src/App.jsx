import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, getDoc, setDoc, addDoc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, Flame, Plus, Music2, X, HelpCircle, ArrowUp } from 'lucide-react';
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
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es');
  const [showHelp, setShowHelp] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [showScroll, setShowScroll] = useState(false);
  const [suggested, setSuggested] = useState(false);

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
        
        // Ensure user document exists
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

  // Now Playing listener
  useEffect(() => {
    const stateRef = doc(db, 'state', 'nowPlaying');
    const unsubscribe = onSnapshot(stateRef, (docSnap) => {
      if (docSnap.exists()) {
        setNowPlaying(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, []);

  // 1. Static Catalog Listener
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

  // 2. Active Queue Listener (songs with votes)
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

  const handleVote = async (song) => {
    if (!userId) {
      alert(t.authError);
      return;
    }

    const isProposal = song.votes === 0;

    if (isProposal) {
      if (userProposals.length >= 3) {
        alert(t.alreadyVoted); // We might need a better message for limits
        return;
      }
      if (userProposals.includes(song.id)) {
        alert(t.voted);
        return;
      }
    } else {
      if (userVotes.length >= 5) {
        alert(t.alreadyVoted);
        return;
      }
      if (userVotes.includes(song.id)) {
        alert(t.voted);
        return;
      }
    }

    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        [isProposal ? 'proposals' : 'votes']: arrayUnion(song.id)
      }, { merge: true });

      const songRef = doc(db, 'songs', song.id);
      await setDoc(songRef, {
        title: song.title,
        votes: increment(1),
        firstVotedAt: isProposal ? Date.now() : (activeQueue[song.id]?.firstVotedAt || Date.now())
      }, { merge: true });

      setSearchTerm('');
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
      setSearchTerm('');
    } catch (error) {
      console.error("Error sending suggestion:", error);
    }
  };

  // Combinar catálogo con votos de la cola activa
  const mergedSongs = catalog
    .map(song => ({
      ...song,
      votes: activeQueue[song.id]?.votes || 0,
      firstVotedAt: activeQueue[song.id]?.firstVotedAt || null
    }))
    .filter(song => song.available !== false)
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      if (a.firstVotedAt && b.firstVotedAt) return a.firstVotedAt - b.firstVotedAt;
      return 0;
    });

  const filteredSongs = mergedSongs.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateProgress = () => {
    if (!nowPlaying || !nowPlaying.totalTime || nowPlaying.totalTime === 0) return 0;
    return (nowPlaying.currentTime / nowPlaying.totalTime) * 100;
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-brand-gold">{t.loading}</div>;
  }

  const topSongId = mergedSongs.length > 0 && mergedSongs[0].votes > 0 ? mergedSongs[0].id : null;

  return (
    <div className="min-h-screen pb-24 bg-zinc-950 font-sans selection:bg-brand-neon-purple/30">
      
      {/* Header Fijo */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-brand-gold/20 p-4 shrink-0 flex flex-col items-center justify-center">
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => setLang('es')}
            className={`text-xl transition-opacity ${lang === 'es' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
            title="Español"
          >
            🇪🇸
          </button>
          <button
            onClick={() => setLang('en')}
            className={`text-xl transition-opacity ${lang === 'en' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
            title="English"
          >
            🇺🇸
          </button>
        </div>
        <h1 className="font-serif text-3xl font-black text-brand-gold tracking-widest uppercase mb-1">
          La Catrina
        </h1>
        <h2 className="font-script text-2xl text-brand-gold-dark -mt-2">
          {t.subtitle}
        </h2>
      </header>

      <main className="p-4 space-y-6 max-w-lg mx-auto">
        
        {/* Ayuda / How it works */}
        <button
          onClick={() => { setHelpStep(0); setShowHelp(true); }}
          className="w-full flex items-center justify-center gap-2 py-2 text-zinc-500 hover:text-brand-neon-purple transition-colors text-sm font-medium"
        >
          <HelpCircle size={18} />
          {t.howItWorks}
        </button>

        {/* Ahora Sonando */}
        <section className="bg-zinc-900 border border-brand-neon-purple/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(176,38,255,0.15)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-neon-purple/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="flex items-center gap-2 text-brand-neon-purple font-semibold uppercase tracking-wider text-xs mb-3">
            <Music2 size={16} className="animate-pulse" />
            {t.nowPlaying}
          </div>
          
          <h3 className="text-xl font-bold text-white mb-6 line-clamp-2 leading-tight">
            {nowPlaying ? nowPlaying.title : t.autoMode}
          </h3>
          
          {/* Progress Bar */}
          <div className="space-y-2">
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
        </section>

        {/* User Status Banner (Sticky under header) */}
        <div className="sticky top-[110px] z-40 bg-zinc-950 pb-2 flex gap-2">
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

        {/* Search */}
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

        {/* Catalog */}
        <section className="space-y-3">
          {filteredSongs.length === 0 ? (
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
                  className={`w-full py-3 rounded-xl font-bold transition-all ${
                    suggested
                      ? 'bg-brand-neon-green/20 text-brand-neon-green'
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
            filteredSongs.map((song) => {
              const isTop = song.id === topSongId && song.votes > 0;
              const isNowPlaying = nowPlaying?.title === song.title;
              const hasVotedThis = userVotes.includes(song.id) || userProposals.includes(song.id);
              const isProposal = song.votes === 0;
              const limitReached = isProposal ? userProposals.length >= 3 : userVotes.length >= 5;
              
              return (
                <div 
                  key={song.id} 
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    isTop ? 'bg-zinc-900 border border-brand-gold/30' : 'bg-transparent hover:bg-zinc-900'
                  }`}
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">
                      {song.title}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1">
                      {song.votes > 0 && <Flame size={12} className="text-brand-gold" />}
                      <span className={`text-xs ${song.votes > 0 ? 'text-brand-gold font-medium' : 'text-zinc-600'}`}>
                        {song.votes === 0 ? t.noVotes : `${song.votes} ${song.votes === 1 ? t.vote : t.votes}`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleVote(song)}
                    disabled={isNowPlaying || hasVotedThis || limitReached}
                    className={`shrink-0 flex items-center justify-center h-10 px-4 rounded-lg font-medium text-sm transition-all ${
                      isNowPlaying
                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                        : hasVotedThis
                          ? 'bg-brand-neon-purple/20 text-brand-neon-purple cursor-not-allowed'
                          : limitReached
                            ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                            : song.votes === 0
                              ? 'bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-600'
                              : 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 active:bg-brand-gold/30'
                    }`}
                  >
                    {!isNowPlaying && !hasVotedThis && !limitReached && song.votes === 0 && <Plus size={16} className="mr-1" />}
                    {isNowPlaying
                      ? t.nowPlayingBtn
                      : hasVotedThis
                        ? t.voted
                        : song.votes === 0
                          ? t.add
                          : t.voteButton}
                  </button>
                </div>
              );
            })
          )}
        </section>

      </main>

      {/* Help Modal */}
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

      {/* Scroll to Top */}
      {showScroll && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-zinc-900 border border-brand-neon-purple text-brand-neon-purple rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(176,38,255,0.5)] transition-all hover:scale-110 active:scale-95"
        >
          <ArrowUp size={24} />
        </button>
      )}
    </div>
  );
}
