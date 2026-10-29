import { X } from 'lucide-react';
import { CornerFlourish } from './Ornaments';

export default function DesignSurveyModal({ isCatrina, surveySubmitted, submitDesignSurvey, dismissSurvey, t }) {
  return (
    <div className="jukebox-modal-overlay" style={{ zIndex: 150 }}>
      <div className="jukebox-modal text-center">
        {isCatrina && (
          <>
            <CornerFlourish position="tl" size={28} />
            <CornerFlourish position="tr" size={28} />
            <CornerFlourish position="bl" size={28} />
            <CornerFlourish position="br" size={28} />
          </>
        )}
        <button onClick={dismissSurvey} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}>
          <X size={24} />
        </button>

        {!surveySubmitted ? (
          <div className={`space-y-6 ${isCatrina ? 'relative z-[1]' : ''}`}>
            <div className="text-5xl mb-2">🎨</div>
            <h2 className={`text-xl font-bold ${isCatrina ? 'jukebox-section-title' : 'text-brand-gold'}`}>
              {t.surveyTitle}
            </h2>
            <p className={`text-sm leading-relaxed ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-400'}`}>
              {t.surveyDesc}
            </p>
            <div className="space-y-3">
              <button
                onClick={() => submitDesignSurvey('new')}
                className={`w-full py-3 font-bold transition-all active:scale-[0.98] ${isCatrina ? 'jukebox-btn-primary' : 'bg-gradient-to-r from-brand-neon-purple to-brand-neon-green text-white rounded-xl hover:opacity-90'}`}
              >
                {t.surveyNew}
              </button>
              <button
                onClick={() => submitDesignSurvey('old')}
                className={`w-full py-3 rounded-xl font-bold transition-all ${isCatrina ? 'border border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10' : 'border border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10'}`}
              >
                {t.surveyClassic}
              </button>
            </div>
            <button onClick={dismissSurvey} className={`text-xs transition-colors ${isCatrina ? 'text-brand-gold/30 hover:text-brand-gold' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {t.surveySkip}
            </button>
          </div>
        ) : (
          <div className={`space-y-4 ${isCatrina ? 'relative z-[1]' : ''}`}>
            <div className="text-5xl">✅</div>
            <h2 className={`text-xl font-bold ${isCatrina ? 'text-brand-gold' : 'text-brand-gold'}`}>
              {t.surveyThanks}
            </h2>
            <p className={`text-sm ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-400'}`}>
              {t.surveyThanksDesc}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
