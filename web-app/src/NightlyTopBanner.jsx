import { Crown } from 'lucide-react';

export default function NightlyTopBanner({ nightlyTop, isCatrina, mainTextClass, t }) {
  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border ${isCatrina ? 'bg-brand-gold/5 border-brand-gold/25' : 'bg-brand-neon-purple/10 border-brand-neon-purple/30'}`}>
      <Crown size={18} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
      <p className={`text-sm font-bold ${mainTextClass}`}>{t.djOfNight}:</p>
      <p className={`text-sm font-bold truncate ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>{nightlyTop.name}</p>
      <span className={`text-xs font-bold shrink-0 ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-500'}`}>({nightlyTop.points} {t.points})</span>
    </div>
  );
}
