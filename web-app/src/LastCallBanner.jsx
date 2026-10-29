import { X } from 'lucide-react';

export default function LastCallBanner({ isCatrina, t, onClose }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${isCatrina ? 'bg-[#1a120a] border-brand-gold/40' : 'bg-brand-gold/10 border-brand-gold/50'} shadow-[0_0_20px_rgba(204,165,63,0.15)]`}>
      <span className="text-2xl leading-none">⏰</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-brand-gold">{t.lastCallTitle}</p>
        <p className={`text-xs mt-0.5 ${isCatrina ? 'text-brand-gold/60' : 'text-zinc-400'}`}>{t.lastCallDesc}</p>
      </div>
      <button onClick={onClose} className={`p-1 shrink-0 transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold' : 'text-zinc-500 hover:text-white'}`}>
        <X size={16} />
      </button>
    </div>
  );
}
