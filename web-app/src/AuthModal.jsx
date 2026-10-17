import { X } from 'lucide-react';
import { CornerFlourish } from './Ornaments';

export default function AuthModal({
  isCatrina,
  authMode,
  setAuthMode,
  setAuthErrorMsg,
  onClose,
  regDjName,
  setRegDjName,
  regEmail,
  setRegEmail,
  regPassword,
  setRegPassword,
  authErrorMsg,
  handleRegister,
  handleLogin,
  handleForgotPassword,
  t,
}) {
  return (
    <div className="jukebox-modal-overlay">
      <div className="jukebox-modal">
        {isCatrina && (
          <>
            <CornerFlourish position="tl" size={28} />
            <CornerFlourish position="tr" size={28} />
          </>
        )}
        <button onClick={onClose} className={`absolute top-4 right-4 transition-colors ${isCatrina ? 'jukebox-modal-close' : 'text-zinc-500 hover:text-white'}`}>
          <X size={24} />
        </button>
        <div className={`text-center mb-6 ${isCatrina ? 'relative z-[1]' : ''}`}>
          <div className="text-5xl mb-2">{isCatrina ? '\uD83C\uDFB8' : '\uD83C\uDFA7'}</div>
          <h2 className={`text-2xl font-bold uppercase tracking-wider ${isCatrina ? 'jukebox-section-title' : 'text-brand-gold'}`}>
            {authMode === 'register' ? t.registerTitle : t.loginTitle}
          </h2>
          <p className={`text-sm mt-2 ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-400'}`}>{authMode === 'register' ? t.registerDesc : t.loginDesc}</p>
          {authMode === 'register' && (
            <div className={`mt-4 text-left space-y-1.5 ${isCatrina ? 'relative z-[1]' : ''}`}>
              {t.registerBenefits.map((b, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs leading-snug ${isCatrina ? 'text-brand-gold/60' : 'text-zinc-300'}`}>
                  <span className={`mt-0.5 shrink-0 font-bold ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-green'}`}>✓</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={authMode === 'register' ? handleRegister : handleLogin} className={`space-y-4 ${isCatrina ? 'relative z-[1]' : ''}`}>
          {authMode === 'register' && (
            <div className="space-y-1">
              <input type="text" placeholder={t.registerDjName} value={regDjName} onChange={(e) => setRegDjName(e.target.value)} required maxLength={20} autoFocus
                className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all'} />
              <p className={`text-[11px] px-1 ${isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}`}>{t.registerDjNameHelp}</p>
            </div>
          )}
          <input type="email" placeholder={t.registerEmail} value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required
            className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all'} />
          <input type="password" placeholder={t.registerPassword} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={6}
            className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:border-brand-neon-purple focus:outline-none focus:ring-1 focus:ring-brand-neon-purple transition-all'} />
          {authErrorMsg && <p className="text-red-400 text-sm text-center">{authErrorMsg}</p>}
          <button type="submit" className={`w-full text-white font-bold py-3 transition-all active:scale-[0.98] ${isCatrina ? 'jukebox-btn-primary' : 'bg-gradient-to-r from-brand-neon-purple to-brand-neon-green rounded-xl hover:opacity-90'}`}>
            {authMode === 'register' ? t.registerButton : t.loginButton}
          </button>
        </form>
        {authMode === 'login' && (
          <button
            onClick={handleForgotPassword}
            className={`w-full text-center text-xs mt-3 underline transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {t.forgotPassword}
          </button>
        )}
        <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthErrorMsg(''); }}
          className={`w-full text-center text-sm mt-4 transition-colors ${isCatrina ? 'text-brand-gold/50 hover:text-brand-gold' : 'text-zinc-500 hover:text-brand-gold'}`}>
          {authMode === 'register' ? t.loginLink : t.registerLink}
        </button>
        <button onClick={onClose}
          className={`w-full text-center text-xs mt-2 ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>{t.backToGuest}</button>
        <div className={`mt-6 ${isCatrina ? 'jukebox-privacy' : 'p-3 bg-zinc-950/50 rounded-xl border border-zinc-800 text-[11px] text-zinc-500 text-center leading-relaxed'}`}>
          {t.privacyNotice}
        </div>
      </div>
    </div>
  );
}
