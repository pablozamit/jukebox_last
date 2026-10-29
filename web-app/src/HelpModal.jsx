import { X } from 'lucide-react';
import { useEffect } from 'react';
import { CornerFlourish } from './Ornaments';

export default function HelpModal({ isCatrina, onClose, onRegister, onLogin, isRegistered, socialEnabled, t }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const sections = socialEnabled ? t.howSections : t.howSections.filter(section => section.key !== 'map');
  return (
    <div className="jukebox-modal-overlay" onClick={onClose}>
      <section className="jukebox-modal how-guide" role="dialog" aria-modal="true" aria-labelledby="how-guide-title" onClick={event => event.stopPropagation()}>
        {isCatrina && <><CornerFlourish position="tl" size={28} /><CornerFlourish position="tr" size={28} /></>}
        <button type="button" onClick={onClose} aria-label={t.howClose} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}><X size={24} /></button>
        <div className="how-guide-content">
          <span className="how-guide-eyebrow">LA CATRINA · JUKEBOX</span>
          <h2 id="how-guide-title">{t.musicInvitationTitle}</h2>
          <p className="how-guide-intro">{t.howIntro}</p>
          <div className="how-guide-sections">{sections.map(section => <div className="how-guide-section" key={section.key}><span aria-hidden="true">{section.icon}</span><div><h3>{section.title}</h3><p>{section.text}</p></div></div>)}</div>
          {!isRegistered && <div className="how-guide-actions"><button type="button" onClick={onRegister} className="jukebox-btn-primary">{t.djCreateAccount} →</button><button type="button" onClick={onLogin}>{t.djAlreadyAccount}</button></div>}
        </div>
      </section>
    </div>
  );
}
