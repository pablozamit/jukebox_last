import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Flame, Play, SkipForward, EyeOff, Eye, ArrowLeft, Trash2, Search, X, ArrowUp, BarChart3, Disc3, Music2 } from 'lucide-react';
import { db } from './firebase';
import { translations } from './translations';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem('adminAuth') === 'true');
  const [catalog, setCatalog] = useState([]);
  const [activeQueue, setActiveQueue] = useState({});
  const [nowPlaying, setNowPlaying] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es');
  const [showScroll, setShowScroll] = useState(false);
  const [showStats, setShowStats] = useState(false);

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

  useEffect(() => {
    if (!authenticated) return;
    const stateRef = doc(db, 'state', 'nowPlaying');
    const unsubState = onSnapshot(stateRef, (docSnap) => {
      if (docSnap.exists()) setNowPlaying(docSnap.data());
    });

    const catalogRef = doc(db, 'catalog', 'full_list');
    const unsubCatalog = onSnapshot(catalogRef, (docSnap) => {
      if (docSnap.exists()) setCatalog(docSnap.data().songs || []);
    });

    const songsRef = collection(db, 'songs');
    const unsubSongs = onSnapshot(songsRef, (snapshot) => {
      const queueMap = {};
      snapshot.docs.forEach(doc => {
        queueMap[doc.id] = doc.data();
      });
      setActiveQueue(queueMap);
    });

    const suggestionsRef = collection(db, 'suggestions');
    const qSuggestions = query(suggestionsRef, orderBy('timestamp', 'desc'));
    const unsubSuggestions = onSnapshot(qSuggestions, (snapshot) => {
      const sugList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSuggestions(sugList);
    });

    return () => {
      unsubState();
      unsubCatalog();
      unsubSongs();
      unsubSuggestions();
    };
  }, [authenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'vacainfame') {
      setAuthenticated(true);
      localStorage.setItem('adminAuth', 'true');
    } else {
      alert(t.wrongPassword);
    }
  };

  const handleForcePlay = async (songId) => {
    try {
      await setDoc(doc(db, 'commands', 'forcePlay'), { filename: songId });
    } catch (error) {
      alert("Error al forzar reproducción: " + error.message);
    }
  };

  const handleSkip = async () => {
    try {
      await setDoc(doc(db, 'commands', 'skipCurrent'), { skip: true });
    } catch (error) {
      alert("Error al saltar canción: " + error.message);
    }
  };

  const handleDeleteSuggestion = async (id, title) => {
    const confirmMsg = t.confirmDelete.replace('{title}', title);
    if (window.confirm(confirmMsg)) {
      try {
        await deleteDoc(doc(db, 'suggestions', id));
      } catch (error) {
        alert("Error al borrar sugerencia: " + error.message);
      }
    }
  };

  // Función para devolver tokens a los usuarios si el admin borra una canción manualmente
  const refundTokensForSong = async (songId) => {
    try {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      snap.forEach(async (uDoc) => {
        const d = uDoc.data();
        if ((d.proposals && d.proposals.includes(songId)) || (d.votes && d.votes.includes(songId))) {
          const newProposals = (d.proposals || []).filter(id => id !== songId);
          const newVotes = (d.votes || []).filter(id => id !== songId);
          await updateDoc(doc(db, 'users', uDoc.id), {
            proposals: newProposals,
            votes: newVotes
          });
        }
      });
    } catch (error) {
      console.error("Error al devolver tokens:", error);
    }
  };

  const updateVotes = async (song, numVotes) => {
    try {
      const songRef = doc(db, 'songs', song.id);
      if (numVotes <= 0) {
        // Borramos la canción y devolvemos los tokens a los clientes
        await deleteDoc(songRef);
        await refundTokensForSong(song.id);
      } else {
        await setDoc(songRef, {
          title: song.title,
          votes: numVotes,
          firstVotedAt: Date.now()
        }, { merge: true });
      }
    } catch (error) {
      alert("Error al actualizar votos: " + error.message);
    }
  };

  const toggleAvailability = async (songId) => {
    try {
      const catalogRef = doc(db, 'catalog', 'full_list');
      const updatedCatalog = catalog.map(s =>
        s.id === songId ? { ...s, available: !s.available } : s
      );
      await updateDoc(catalogRef, { songs: updatedCatalog });
    } catch (error) {
      alert("Error al ocultar/mostrar canción: " + error.message);
    }
  };

  const calculateProgress = () => {
    if (!nowPlaying || !nowPlaying.totalTime) return 0;
    return (nowPlaying.currentTime / nowPlaying.totalTime) * 100;
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-brand-neon-purple/30 relative">
        <div className="absolute top-6 right-6 flex gap-2">
          <button
            onClick={() => setLang('es')}
            className={`text-xl transition-opacity ${lang === 'es' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
          >
            🇪🇸
          </button>
          <button
            onClick={() => setLang('en')}
            className={`text-xl transition-opacity ${lang === 'en' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
          >
            🇺🇸
          </button>
        </div>
        <a href="/" className="absolute top-6 left-6 sm:top-8 sm:left-8 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors">
          <ArrowLeft size={20} />
          <span className="text-sm font-medium hidden sm:inline">{t.backToJukebox}</span>
        </a>
        <div className="text-center mb-8">
          <h1 className="font-serif text-4xl font-black text-brand-gold tracking-widest uppercase mb-1">
            La Catrina
          </h1>
          <h2 className="font-script text-3xl text-brand-gold-dark -mt-2">
            {t.adminPanel}
          </h2>
        </div>
        <form onSubmit={handleLogin} className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 w-full max-w-sm space-y-6 shadow-[0_0_20px_rgba(176,38,255,0.1)]">
          <input
            type="password"
            placeholder={t.adminPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all"
            autoFocus
          />
          <button type="submit" className="w-full bg-gradient-to-r from-brand-neon-purple to-brand-neon-green text-white font-bold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all">
            {t.login}
          </button>
        </form>
      </div>
    );
  }

  const mergedSongs = catalog
    .map(song => ({
      ...song,
      votes: activeQueue[song.id]?.votes || 0,
      firstVotedAt: activeQueue[song.id]?.firstVotedAt || null
    }));

  const nextInQueue = mergedSongs
    .filter(s => s.votes > 0)
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return (a.firstVotedAt || 0) - (b.firstVotedAt || 0);
    });

  const filteredQueue = nextInQueue.filter(song =>
    song.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCatalog = mergedSongs
    .filter(song => song.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return a.title.localeCompare(b.title);
    });

  const filteredSuggestions = suggestions.filter(s =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm} ${hh}:${min}`;
  };

  return (
    <div className="min-h-screen pb-24 bg-zinc-950 font-sans text-white">
      <header className="sticky top-0 z-50 bg-zinc-900 border-b border-zinc-800 p-2 sm:p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-1 sm:gap-3">
          <a href="/" className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors cursor-pointer" title={t.backToJukebox}>
            <ArrowLeft size={20} />
          </a>
          <button
            onClick={() => setShowStats(true)}
            className="text-brand-gold hover:text-white transition-colors p-2"
            title={t.statsTitle}
          >
            <BarChart3 size={24} />
          </button>
          <div className="hidden sm:block">
            <h1 className="font-serif font-black text-xl text-brand-gold uppercase tracking-wider leading-none">Admin</h1>
            <span className="text-xs text-zinc-400 block mt-1">Jukebox Control Panel</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex gap-1 sm:gap-2">
            <button
              onClick={() => setLang('es')}
              className={`text-lg sm:text-xl transition-opacity ${lang === 'es' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
            >
              🇪🇸
            </button>
            <button
              onClick={() => setLang('en')}
              className={`text-lg sm:text-xl transition-opacity ${lang === 'en' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
            >
              🇺🇸
            </button>
          </div>
          <button onClick={handleSkip} className="bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-red-500/20 transition-colors">
            <SkipForward size={18} />
            <span className="hidden sm:inline">{t.skipSong}</span>
          </button>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6">
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

        {nowPlaying && (
          <section className="bg-zinc-900 border border-brand-neon-purple/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(176,38,255,0.05)]">
            <h2 className="text-brand-neon-purple text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <Play size={14} className="animate-pulse" /> {t.nowPlaying}
            </h2>
            <p className="text-xl font-bold truncate mb-4">{nowPlaying.title || t.autoMode}</p>
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-brand-neon-purple to-brand-neon-green transition-all duration-1000"
                style={{ width: `${calculateProgress()}%` }}
              ></div>
            </div>
          </section>
        )}

        {filteredQueue.length > 0 && (
          <section className="bg-zinc-900 border border-brand-gold/30 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(255,204,0,0.05)]">
            <div className="bg-brand-gold/10 px-5 py-3 border-b border-brand-gold/20 flex justify-between items-center">
              <h2 className="text-brand-gold text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Flame size={14} /> {t.nextInQueue}
              </h2>
              <span className="text-brand-gold/60 text-xs font-bold">{filteredQueue.length}</span>
            </div>
            <div className="max-h-[35vh] overflow-y-auto custom-scrollbar divide-y divide-zinc-800/50">
              {filteredQueue.map((song, index) => {
                const originalIndex = nextInQueue.findIndex(s => s.id === song.id);
                return (
                  <div key={`queue-${song.id}`} className="flex justify-between items-center bg-transparent p-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-zinc-500 font-bold w-4 text-center text-xs">{originalIndex + 1}</span>
                      <span className="font-medium text-white truncate text-sm">{song.title}</span>
                    </div>
                    <div className="flex items-center gap-3 pl-3 shrink-0">
                      <span className="flex items-center gap-1 font-bold text-brand-gold text-xs">
                        {song.votes}
                      </span>
                      <button
                        onClick={() => handleForcePlay(song.id)}
                        disabled={song.available === false}
                        className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${song.available === false ? 'bg-zinc-800 text-zinc-600' : 'bg-brand-neon-green/10 text-brand-neon-green hover:bg-brand-neon-green/30'}`}
                        title={t.playNext}
                      >
                        <Play size={14} className="translate-x-[1px]" />
                      </button>
                      <button
                        onClick={() => updateVotes(song, 0)}
                        className="p-1.5 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500/30 transition-colors"
                        title={t.removeFromQueue}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Suggestions Section */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-zinc-800/50 px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
            <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Music2 size={14} /> {t.suggestionsTitle}
            </h2>
            <span className="text-zinc-500 text-xs font-bold">{filteredSuggestions.length}</span>
          </div>
          <div className="max-h-[35vh] overflow-y-auto custom-scrollbar divide-y divide-zinc-800/50">
            {filteredSuggestions.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-sm">
                {t.noSuggestions}
              </div>
            ) : (
              filteredSuggestions.map((sug) => (
                <div key={sug.id} className="flex justify-between items-center p-4 hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{sug.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">{formatDate(sug.timestamp)}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteSuggestion(sug.id, sug.title)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors ml-4"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1 mb-2">
             <div className="h-px flex-1 bg-zinc-800"></div>
             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t.songCatalog} ({filteredCatalog.length})</span>
             <div className="h-px flex-1 bg-zinc-800"></div>
          </div>

          {filteredCatalog.length === 0 ? (
            <p className="text-center text-zinc-600 py-10">{t.noResults}</p>
          ) : (
            filteredCatalog.map(song => (
              <div key={song.id} className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center transition-opacity ${song.available === false ? 'bg-zinc-950 border-red-500/20 opacity-60' : 'bg-zinc-900 border-zinc-800 shadow-sm'}`}>
                
                <div className="flex-1 min-w-0 w-full">
                  <h4 className={`font-bold truncate ${song.available === false ? 'line-through text-zinc-500' : 'text-white'}`}>{song.title}</h4>
                  <div className="text-sm text-zinc-400 mt-2 flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium">
                      <Flame size={14} className={song.votes > 0 ? "text-brand-gold" : "text-zinc-600"} />
                      <span className={song.votes > 0 ? "text-brand-gold font-bold" : ""}>{song.votes} {song.votes === 1 ? t.vote : t.votes}</span>
                    </span>
                    {song.available === false && (
                      <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">{t.hidden}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <div className="flex items-center bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden mr-2">
                    <button onClick={() => updateVotes(song, song.votes - 1)} className="px-3 py-2 hover:bg-zinc-800 text-brand-neon-purple transition-colors">-</button>
                    <span className="px-3 py-2 font-bold min-w-[2.5rem] text-center text-sm">{song.votes}</span>
                    <button onClick={() => updateVotes(song, song.votes + 1)} className="px-3 py-2 hover:bg-zinc-800 text-brand-neon-green transition-colors">+</button>
                  </div>

                  <button
                    onClick={() => handleForcePlay(song.id)}
                    disabled={song.available === false}
                    className={`p-2.5 rounded-lg flex items-center justify-center transition-colors ${song.available === false ? 'bg-zinc-800 text-zinc-600' : 'bg-brand-neon-green/10 text-brand-neon-green hover:bg-brand-neon-green/30'}`}
                    title={t.playNext}
                  >
                    <Play size={18} className="translate-x-[1px]" />
                  </button>

                  <button onClick={() => toggleAvailability(song.id)} className={`p-2.5 rounded-lg transition-colors border ${song.available !== false ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800' : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'}`} title={song.available !== false ? t.hideSong : t.showSong}>
                    {song.available !== false ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      </main>

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
