import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Search, Flame, Plus, Music2 } from 'lucide-react';
import { db, auth } from './firebase';

export default function App() {
  const [songs, setSongs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [nowPlaying, setNowPlaying] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userActiveVote, setUserActiveVote] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // Listen to user document for active vote
        const userRef = doc(db, 'users', user.uid);
        
        // Ensure user document exists
        const userDoc = await getDoc(userRef);
        if(!userDoc.exists()){
          await setDoc(userRef, { activeVote: null });
        }

        const unsubUser = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserActiveVote(docSnap.data().activeVote);
          }
        });
        return () => unsubUser();
      } else {
        setUserId(null);
      }
    });
    return () => unsubscribe();
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

  // Songs Catalog listener
  useEffect(() => {
    const songsRef = collection(db, 'songs');
    const q = query(songsRef, orderBy('votes', 'desc'), orderBy('firstVotedAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songsList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(song => song.available !== false); // ocultar canciones desactivadas
      setSongs(songsList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleVote = async (song) => {
    if (userActiveVote) {
      alert("Ya has votado. Espera a que termine la canción.");
      return;
    }
    
    if (!userId) {
      alert("ERROR: No tienes ID de usuario. Prueba a recargar la página.");
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      // Usamos setDoc para asegurar que el perfil se cree si no existe
      await setDoc(userRef, { activeVote: song.id }, { merge: true });

      const songRef = doc(db, 'songs', song.id);
      await updateDoc(songRef, { 
        votes: increment(1),
        firstVotedAt: Date.now()
      });
      console.log("Voto registrado con éxito");
    } catch (error) {
      alert("CRITICAL ERROR Firebase: " + error.message);
      console.error(error);
    }
  };

  const filteredSongs = songs.filter(song => 
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
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-brand-gold">Cargando...</div>;
  }

  const topSongId = songs.length > 0 && songs[0].votes > 0 ? songs[0].id : null;

  return (
    <div className="min-h-screen pb-24 bg-zinc-950 font-sans selection:bg-brand-neon-purple/30">
      
      {/* Header Fijo */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-brand-gold/20 p-4 shrink-0 flex flex-col items-center justify-center">
        <h1 className="font-serif text-3xl font-black text-brand-gold tracking-widest uppercase mb-1">
          La Catrina
        </h1>
        <h2 className="font-script text-2xl text-brand-gold-dark -mt-2">
          Cocktails & Rock
        </h2>
      </header>

      <main className="p-4 space-y-6 max-w-lg mx-auto">
        
        {/* Ahora Sonando */}
        <section className="bg-zinc-900 border border-brand-neon-purple/30 rounded-2xl p-5 shadow-[0_0_20px_rgba(176,38,255,0.15)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-neon-purple/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="flex items-center gap-2 text-brand-neon-purple font-semibold uppercase tracking-wider text-xs mb-3">
            <Music2 size={16} className="animate-pulse" />
            Ahora Sonando
          </div>
          
          <h3 className="text-xl font-bold text-white mb-6 line-clamp-2 leading-tight">
            {nowPlaying ? nowPlaying.title : 'Modo Automático...'}
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
        <div className="sticky top-[88px] z-40 bg-zinc-950 pb-2">
          <div className={`rounded-xl p-3 text-center text-sm font-medium border shadow-lg transition-colors duration-300 ${
            userActiveVote === null 
              ? 'bg-brand-neon-green/10 border-brand-neon-green/30 text-brand-neon-green' 
              : 'bg-zinc-900 border-zinc-800 text-zinc-400'
          }`}>
            {userActiveVote === null 
              ? '✨ Tienes 1 voto disponible' 
              : '🔒 Voto en uso. Recupera tu token cuando suene.'}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
          <input
            type="text"
            placeholder="Buscar canción o artista..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-brand-neon-purple focus:ring-1 focus:ring-brand-neon-purple transition-all"
          />
        </div>

        {/* Catalog */}
        <section className="space-y-3">
          {filteredSongs.length === 0 ? (
            <p className="text-center text-zinc-600 py-10">No se encontraron resultados.</p>
          ) : (
            filteredSongs.map((song) => {
              const isTop = song.id === topSongId && song.votes > 0;
              const hasVotedThis = userActiveVote === song.id;
              
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
                        {song.votes === 0 ? 'Sin votos' : `${song.votes} voto${song.votes > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <button
                    onClick={() => handleVote(song)}
                    disabled={userActiveVote !== null}
                    className={`shrink-0 flex items-center justify-center h-10 px-4 rounded-lg font-medium text-sm transition-all ${
                      hasVotedThis
                        ? 'bg-brand-neon-purple/20 text-brand-neon-purple cursor-not-allowed'
                        : userActiveVote !== null
                          ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed hidden sm:flex'
                          : song.votes === 0
                            ? 'bg-zinc-800 text-white hover:bg-zinc-700 active:bg-zinc-600'
                            : 'bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 active:bg-brand-gold/30'
                    }`}
                  >
                    {!userActiveVote && song.votes === 0 && <Plus size={16} className="mr-1" />}
                    {hasVotedThis ? 'Votado' : song.votes === 0 ? 'Añadir' : 'Votar'}
                  </button>
                  
                  {userActiveVote !== null && !hasVotedThis && (
                    <button className="sm:hidden w-10 h-10 shrink-0 bg-zinc-800 rounded-lg flex items-center justify-center opacity-50 cursor-not-allowed">
                       <Plus size={16} className="text-zinc-600" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>

      </main>
    </div>
  );
}
