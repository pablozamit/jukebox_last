import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { Flame, Play, SkipForward, EyeOff, Eye, ArrowLeft, Trash2 } from 'lucide-react';
import { db } from './firebase';
import { translations } from './translations';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem('adminAuth') === 'true');
  const [songs, setSongs] = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es');

  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    if (!authenticated) return;
    const stateRef = doc(db, 'state', 'nowPlaying');
    const unsubState = onSnapshot(stateRef, (docSnap) => {
      if (docSnap.exists()) setNowPlaying(docSnap.data());
    });

    const songsRef = collection(db, 'songs');
    const q = query(songsRef, orderBy('votes', 'desc'), orderBy('firstVotedAt', 'asc'));
    const unsubSongs = onSnapshot(q, (snapshot) => {
      setSongs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubState();
      unsubSongs();
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
    await setDoc(doc(db, 'commands', 'forcePlay'), { filename: songId });
  };

  const handleSkip = async () => {
    await setDoc(doc(db, 'commands', 'skipCurrent'), { skip: true });
  };

  const updateVotes = async (songId, numVotes) => {
    const updateData = { votes: numVotes < 0 ? 0 : numVotes };
    if (numVotes > 0) {
      updateData.firstVotedAt = Date.now();
    }
    await updateDoc(doc(db, 'songs', songId), updateData);
  };

  const toggleAvailability = async (songId, currentStatus) => {
    await updateDoc(doc(db, 'songs', songId), { available: !currentStatus });
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

  return (
    <div className="min-h-screen pb-24 bg-zinc-950 font-sans text-white">
      <header className="sticky top-0 z-50 bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <a href="/" className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors cursor-pointer" title={t.backToJukebox}>
            <ArrowLeft size={20} />
          </a>
          <div>
            <h1 className="font-serif font-black text-xl text-brand-gold uppercase tracking-wider leading-none">Admin</h1>
            <span className="text-xs text-zinc-400 block mt-1">Jukebox Control Panel</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
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
          <button onClick={handleSkip} className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-red-500/20 transition-colors">
            <SkipForward size={18} />
            <span className="hidden sm:inline">{t.skipSong}</span>
          </button>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6">
        {/* Ahora Sonando */}
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

        {/* Cola Real de Reproducción */}
        {songs.filter(s => s.votes > 0).length > 0 && (
          <section className="bg-zinc-900 border border-brand-gold/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(255,204,0,0.05)]">
            <h2 className="text-brand-gold text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
               {t.nextInQueue} ({songs.filter(s => s.votes > 0).length})
            </h2>
            <div className="space-y-2">
              {songs.filter(s => s.votes > 0).map((song, index) => (
                <div key={`queue-${song.id}`} className="flex justify-between items-center bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-zinc-500 font-bold w-4 text-center">{index + 1}</span>
                    <span className="font-medium text-white truncate">{song.title}</span>
                  </div>
                  <div className="flex items-center gap-3 pl-3 shrink-0">
                    <span className="flex items-center gap-1 font-medium text-brand-gold text-sm">
                      <Flame size={14} /> {song.votes}
                    </span>
                    <button 
                      onClick={() => handleForcePlay(song.id)} 
                      disabled={song.available === false}
                      className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${song.available === false ? 'bg-zinc-800 text-zinc-600' : 'bg-brand-neon-green/10 text-brand-neon-green hover:bg-brand-neon-green/30'}`} 
                      title={t.playNext}
                    >
                      <Play size={16} className="translate-x-[1px]" />
                    </button>
                    <button 
                      onClick={() => updateVotes(song.id, 0)} 
                      className="p-1.5 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500/30 transition-colors"
                      title={t.removeFromQueue}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-300 ml-1 mb-2">{t.songCatalog}</h2>
          {songs.map(song => (
            <div key={song.id} className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center transition-opacity ${song.available === false ? 'bg-zinc-950 border-red-500/20 opacity-60' : 'bg-zinc-900 border-zinc-800'}`}>
              
              <div className="flex-1 min-w-0 w-full">
                <h4 className={`font-medium truncate ${song.available === false ? 'line-through text-zinc-500' : 'text-white'}`}>{song.title}</h4>
                <div className="text-sm text-zinc-400 mt-2 flex items-center gap-3">
                  <span className="flex items-center gap-1 font-medium">
                    <Flame size={14} className={song.votes > 0 ? "text-brand-gold" : "text-zinc-600"} /> 
                    <span className={song.votes > 0 ? "text-brand-gold" : ""}>{song.votes} {song.votes === 1 ? t.vote : t.votes}</span>
                  </span>
                  {song.available === false && (
                    <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">{t.hidden}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                {/* Controles de Votos */}
                <div className="flex items-center bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden mr-2">
                  <button onClick={() => updateVotes(song.id, song.votes - 1)} className="px-3 py-2 hover:bg-zinc-800 text-brand-neon-purple">-</button>
                  <span className="px-3 py-2 font-bold min-w-[2.5rem] text-center text-sm">{song.votes}</span>
                  <button onClick={() => updateVotes(song.id, song.votes + 1)} className="px-3 py-2 hover:bg-zinc-800 text-brand-neon-green">+</button>
                </div>

                {/* Forzar Reproducción */}
                <button 
                  onClick={() => handleForcePlay(song.id)} 
                  disabled={song.available === false}
                  className={`p-2.5 rounded-lg flex items-center justify-center transition-colors ${song.available === false ? 'bg-zinc-800 text-zinc-600' : 'bg-brand-neon-green/10 text-brand-neon-green hover:bg-brand-neon-green/30'}`} 
                  title={t.playNext}
                >
                  <Play size={18} className="translate-x-[1px]" />
                </button>

                {/* Toggle Visibilidad */}
                <button onClick={() => toggleAvailability(song.id, song.available)} className={`p-2.5 rounded-lg transition-colors border ${song.available !== false ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800' : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'}`} title={song.available !== false ? t.hideSong : t.showSong}>
                  {song.available !== false ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
