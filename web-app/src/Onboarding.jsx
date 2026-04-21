import { useState, useRef } from 'react';
import { Skull, Ghost, Guitar, Zap, ChevronRight, MapPin } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const ROCK_NAMES = [
  "Mick Jaleo", "Freddie Mer-curro", "Slash-itero", "Axl Rosas", "Janis Jaleos",
  "Kurt Co-vainilla", "Ozzy Oscuro", "Courtney Love-r", "Bon Jaleovi", "David Polvorilla",
  "Joan Jet-lag", "Iggy Pop-ero", "Lemmy Birra", "Angus Joven", "Ringo Estrella",
  "Patti Smith-ero", "Debbie Harry-ble", "Jim Morros-on", "Jimi Juerga", "Bruce Spring-pica"
];

const AVATARS = [
  { id: 'skull', icon: Skull },
  { id: 'ghost', icon: Ghost },
  { id: 'guitar', icon: Guitar },
  { id: 'zap', icon: Zap }
];

const COLORS = [
  'bg-fuchsia-500', 'bg-cyan-400', 'bg-lime-400', 'bg-amber-400', 'bg-rose-500',
  'bg-indigo-500', 'bg-emerald-400', 'bg-orange-500', 'bg-violet-500', 'bg-sky-400'
];

export default function Onboarding({ userId, onComplete, t }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [color, setColor] = useState(COLORS[0]);
  const [coords, setCoords] = useState({ x: null, y: null });
  const mapRef = useRef(null);

  const handleRandomName = () => {
    const randomName = ROCK_NAMES[Math.floor(Math.random() * ROCK_NAMES.length)];
    setName(randomName);
  };

  const handleMapClick = (e) => {
    if (mapRef.current) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setCoords({ x: x.toFixed(2), y: y.toFixed(2) });
    }
  };

  const handleSave = async () => {
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        name,
        avatar,
        color,
        x: coords.x,
        y: coords.y,
        lastActive: Date.now()
      }, { merge: true });
      onComplete();
    } catch (error) {
      console.error("Error saving profile:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col text-white font-sans overflow-y-auto">
      <div className="max-w-md mx-auto w-full p-6 flex-1 flex flex-col justify-center space-y-8">

        {/* Progress bar */}
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-brand-neon-purple' : 'bg-zinc-800'}`}
            />
          ))}
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-black text-brand-gold uppercase tracking-tighter mb-2 italic">
            {t.onboarding.title}
          </h1>
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-center">{t.onboarding.step1.title}</h2>
            <div className="space-y-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.onboarding.step1.placeholder}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 px-6 text-xl focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all"
              />
              <button
                onClick={handleRandomName}
                className="w-full py-3 text-brand-gold font-medium hover:text-white transition-colors"
              >
                🎲 {t.onboarding.step1.randomBtn}
              </button>
            </div>
            <button
              disabled={!name}
              onClick={() => setStep(2)}
              className="w-full bg-brand-neon-purple text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.next} <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 2: Avatar */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-center">{t.onboarding.step2.title}</h2>
            <div className="grid grid-cols-2 gap-4">
              {AVATARS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setAvatar(id)}
                  className={`aspect-square rounded-3xl flex items-center justify-center border-2 transition-all ${
                    avatar === id
                      ? 'bg-brand-neon-purple/20 border-brand-neon-purple text-brand-neon-purple scale-105'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                  }`}
                >
                  <Icon size={48} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <button
              disabled={!avatar}
              onClick={() => setStep(3)}
              className="w-full bg-brand-neon-purple text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.next} <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 3: Map */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center">
              <h2 className="text-xl font-bold">{t.onboarding.step3.title}</h2>
              <p className="text-zinc-500 text-sm mt-1">{t.onboarding.step3.subtitle}</p>
            </div>

            <div
              ref={mapRef}
              onClick={handleMapClick}
              className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 cursor-crosshair"
            >
              <img src="/map.jpg" alt="Bar Map" className="w-full h-full object-cover opacity-60" />
              {coords.x && coords.y && (
                <div
                  className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 text-brand-neon-green"
                  style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                >
                  <MapPin className="drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                </div>
              )}
            </div>

            <button
              onClick={() => { setCoords({ x: null, y: null }); setStep(4); }}
              className="w-full py-2 text-zinc-500 hover:text-white transition-colors text-sm"
            >
              👻 {t.onboarding.step3.ghostBtn}
            </button>

            <button
              disabled={!coords.x && coords.x !== null} // Should only be disabled if they haven't interacted at all, but we allow null
              onClick={() => setStep(4)}
              className="w-full bg-brand-neon-purple text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
            >
              {t.next} <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 4: Color */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-bold text-center">{t.onboarding.step4.title}</h2>
            <div className="grid grid-cols-5 gap-4">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`aspect-square rounded-full transition-all ${c} ${
                    color === c ? 'ring-4 ring-white scale-110' : 'opacity-60 scale-90'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleSave}
              className="w-full bg-gradient-to-r from-brand-neon-purple to-brand-neon-green text-white font-bold py-5 rounded-2xl shadow-[0_0_20px_rgba(176,38,255,0.4)] text-lg uppercase tracking-wider"
            >
              {t.onboarding.save}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
