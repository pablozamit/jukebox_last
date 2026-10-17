import { CornerFlourish } from './Ornaments';

export default function OutOfTokensModal({ isCatrina, onClose, onRegisterCta, t }) {
  return (
    <div className="jukebox-modal-overlay">
      <div className={`jukebox-modal text-center ${isCatrina ? '' : ''}`}>
        {isCatrina && (
          <>
            <CornerFlourish position="tl" size={28} />
            <CornerFlourish position="tr" size={28} />
            <CornerFlourish position="bl" size={28} />
            <CornerFlourish position="br" size={28} />
          </>
        )}
        <div className={`text-5xl mb-3 ${isCatrina ? 'relative z-[1]' : ''}`}>{isCatrina ? '\uD83C\uDFB6' : '\uD83C\uDFA4'}</div>
        <h2 className={`text-xl font-bold uppercase tracking-wider mb-3 ${isCatrina ? 'jukebox-section-title relative z-[1]' : 'text-brand-gold'}`}>{t.outOfTokensTitle}</h2>
        <p className={`text-sm leading-relaxed mb-2 ${isCatrina ? 'text-brand-gold/50 relative z-[1]' : 'text-zinc-400'}`}>{t.outOfTokensDesc}</p>
        <div className={`mt-4 ${isCatrina ? 'jukebox-privacy relative z-[1]' : 'p-3 bg-zinc-950/50 rounded-xl border border-zinc-800'}`}>
          <p className={isCatrina ? '' : 'text-[11px] text-zinc-500 leading-relaxed'}>{t.privacyNotice}</p>
        </div>
        <button onClick={onRegisterCta}
          className={`mt-6 w-full text-white font-bold py-3 transition-all active:scale-[0.98] ${isCatrina ? 'jukebox-btn-primary relative z-[1]' : 'bg-gradient-to-r from-brand-neon-purple to-brand-neon-green rounded-xl hover:opacity-90'}`}>
          {t.registerCta}
        </button>
        <button onClick={onClose} className={`mt-3 text-sm transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold relative z-[1]' : 'text-zinc-500 hover:text-zinc-300'}`}>{t.maybeLater}</button>
      </div>
    </div>
  );
}
