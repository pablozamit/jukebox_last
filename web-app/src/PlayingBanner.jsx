import { Disc3, X } from 'lucide-react';

export default function PlayingBanner({ isCatrina, mainTextClass, data, onClose, t }) {
  return (
    <div className={isCatrina ? 'jukebox-playing-banner' : 'fixed top-16 left-0 right-0 z-[90] flex justify-center px-4 animate-bounce'}>
      <div className={isCatrina
        ? 'relative px-6 py-4 max-w-sm w-full text-center'
        : 'relative bg-gradient-to-r from-brand-neon-purple/20 to-brand-neon-green/20 border border-brand-neon-purple/40 rounded-2xl px-6 py-4 max-w-sm w-full text-center shadow-[0_0_30px_rgba(176,38,255,0.2)]'
      }>
        <button
          onClick={onClose}
          aria-label="Cerrar aviso de canción sonando"
          className={`absolute top-2 right-2 transition-colors ${isCatrina ? 'text-brand-gold/70 hover:text-brand-gold' : 'text-zinc-400 hover:text-white'}`}
        >
          <X size={16} />
        </button>
        <p className={`font-bold text-sm flex items-center justify-center gap-2 ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-green'}`}>
          <Disc3 size={18} className="animate-spin" /> {t.yourSongPlaying}
        </p>
        <p className={`font-bold text-lg mt-1 truncate ${mainTextClass}`}>{data.title}</p>
        <p className={`text-xs mt-1 ${isCatrina ? 'text-brand-gold/60' : 'text-brand-gold'}`}>
          {data.isProposed ? t.proposedByYou : t.votedByYou}
        </p>
      </div>
    </div>
  );
}
