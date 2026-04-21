import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db } from './firebase';
import { X, Skull, Ghost, Guitar, Zap, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AVATAR_ICONS = {
  skull: Skull,
  ghost: Ghost,
  guitar: Guitar,
  zap: Zap
};

export default function LiveMap({ onClose, t }) {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Destination: The Bar (left: 85%, top: 60%)
  const BAR_COORDS = { x: 85, y: 60 };

  useEffect(() => {
    // 1. Initial load of active users (last 1 hour)
    const fetchUsers = async () => {
      const oneHourAgo = Date.now() - 3600000;
      const q = query(
        collection(db, 'users'),
        where('lastActive', '>', oneHourAgo)
      );

      const snapshot = await getDocs(q);
      const usersData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(u => u.x !== null && u.y !== null && u.avatar && u.color);

      setUsers(usersData);
      setLoading(false);
    };

    fetchUsers();

    // 2. Listener for live events
    const eventsQuery = query(
      collection(db, 'live_events'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(eventsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const newEvent = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

        // Only trigger if event is fresh (last 10 seconds)
        if (newEvent.timestamp > Date.now() - 10000) {
          setEvents(prev => [...prev.slice(-4), newEvent]);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const renderAvatar = (user) => {
    const Icon = AVATAR_ICONS[user.avatar] || Ghost;
    return (
      <motion.div
        key={user.id}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`absolute -translate-x-1/2 -translate-y-1/2 p-2 rounded-full border-2 border-white/50 shadow-lg ${user.color}`}
        style={{ left: `${user.x}%`, top: `${user.y}%` }}
      >
        <Icon size={20} className="text-white" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-white border border-white/10 uppercase tracking-tighter">
          {user.name}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-brand-neon-green rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          <h2 className="text-brand-gold font-bold uppercase tracking-widest">{t.liveMap.title}</h2>
        </div>
        <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Map Area */}
      <div className="relative flex-1 bg-zinc-950 overflow-hidden">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-brand-gold font-medium">
            {t.loading}
          </div>
        ) : (
          <div className="relative w-full h-full">
            <img
              src="/map.jpg"
              alt="Bar Map"
              className="w-full h-full object-contain md:object-cover opacity-80"
            />

            {/* Users */}
            {users.map(user => renderAvatar(user))}

            {/* Live Animations */}
            <AnimatePresence>
              {events.map(event => {
                const user = users.find(u => u.id === event.userId);
                if (!user || user.x === null) return null;

                return (
                  <motion.div
                    key={event.id}
                    initial={{
                      left: `${user.x}%`,
                      top: `${user.y}%`,
                      opacity: 0,
                      scale: 0.5
                    }}
                    animate={{
                      left: `${BAR_COORDS.x}%`,
                      top: `${BAR_COORDS.y}%`,
                      opacity: [0, 1, 1, 0],
                      scale: [0.5, 1.2, 1, 0.5],
                    }}
                    transition={{ duration: 2, ease: "circOut" }}
                    exit={{ opacity: 0 }}
                    className="absolute z-20 pointer-events-none text-brand-neon-purple drop-shadow-[0_0_15px_rgba(176,38,255,0.9)] -translate-x-1/2 -translate-y-1/2"
                  >
                    <Music size={32} />
                  </motion.div>
                );
              })}
            </AnimatePresence>

          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-zinc-900/80 border-t border-white/10 text-center">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest">
          {t.liveMap.activeNow}: <span className="text-white">{users.length}</span>
        </p>
      </div>
    </div>
  );
}
