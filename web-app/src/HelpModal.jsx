import { X } from 'lucide-react';
import { CornerFlourish } from './Ornaments';

export default function HelpModal({ isCatrina, mainTextClass, helpStep, setHelpStep, onClose, t }) {
  return (
    <div className="jukebox-modal-overlay">
      <div className="jukebox-modal">
        {isCatrina && (
          <>
            <CornerFlourish position="tl" size={28} />
            <CornerFlourish position="tr" size={28} />
            <CornerFlourish position="bl" size={28} />
            <CornerFlourish position="br" size={28} />
          </>
        )}
        <button onClick={onClose} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}>
          <X size={24} />
        </button>

        <div className={`text-center space-y-6 ${isCatrina ? 'relative z-[1]' : ''}`}>
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 ${isCatrina ? 'jukebox-help-step-indicator' : 'bg-brand-gold/10 text-brand-gold'}`}>
            <span className={`text-2xl font-black ${!isCatrina ? 'text-brand-gold' : ''}`}>{helpStep + 1}</span>
          </div>

          <div>
            <h2 className={`text-2xl font-bold mb-3 ${mainTextClass}`}>
              {t.helpSteps[helpStep].title}
            </h2>
            <p className={isCatrina ? 'text-brand-gold/50 leading-relaxed' : 'text-zinc-400 leading-relaxed'}>
              {t.helpSteps[helpStep].text}
            </p>
          </div>

          <div className="flex gap-2 justify-center">
            {[0, 1, 2, 3].map((s) => (
              <div
                key={s}
                className="jukebox-help-dot"
                style={{
                  height: '6px',
                  width: '32px',
                  borderRadius: '9999px',
                  transition: 'background-color 0.3s',
                  backgroundColor: s === helpStep
                    ? (isCatrina ? 'var(--catrina-gold)' : '#cca53f')
                    : (isCatrina ? 'rgba(255,255,255,0.06)' : '#27272a'),
                }}
              />
            ))}
          </div>

          <button
            onClick={() => {
              if (helpStep < 3) setHelpStep(helpStep + 1);
              else onClose();
            }}
            className={`w-full font-bold py-4 transition-all ${isCatrina ? 'jukebox-btn-primary rounded-sm' : 'bg-brand-gold text-zinc-950 rounded-2xl hover:scale-[1.02] active:scale-95'}`}
          >
            {helpStep < 3 ? t.next : t.finish}
          </button>
        </div>
      </div>
    </div>
  );
}
