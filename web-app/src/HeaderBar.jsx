import { BarChart3, Loader2, LogIn, UserRound } from 'lucide-react';

export default function HeaderBar({
  isRegistered,
  isCatrina,
  lang,
  setLang,
  themeSwitching,
  handleToggleTheme,
  onProfileClick,
  onStatsClick,
  t,
}) {
  return (
    <header className="jukebox-header">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-1 sm:gap-2">
        <button
          onClick={onProfileClick}
          className={`shrink-0 flex flex-col items-center justify-center gap-0.5 px-1.5 sm:px-2 transition-colors ${isRegistered ? 'text-brand-gold' : isCatrina ? 'text-brand-gold/60 hover:text-brand-gold' : 'text-white/70 hover:text-brand-neon-purple'}`}
          title={isRegistered ? t.profileTitle : t.loginShort}
        >
          {isRegistered ? <UserRound size={22} /> : <LogIn size={22} />}
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {isRegistered ? t.profileShort : t.loginShort}
          </span>
        </button>

        <div className="flex-1 flex flex-col items-center text-center min-w-0 px-0.5">
          <h1 className="jukebox-logo-title font-serif font-black uppercase text-brand-gold">
            La Catrina
          </h1>
          <h2 className="jukebox-logo-sub font-script text-brand-gold-dark -mt-1 sm:-mt-2">
            {t.subtitle}
          </h2>
        </div>

        <div className="shrink-0 flex items-center gap-1 sm:gap-2">
          <button
            onClick={onStatsClick}
            className="text-brand-gold hover:text-white transition-colors p-1.5 sm:p-2"
            title={t.statsTitle}
          >
            <BarChart3 size={22} />
          </button>

          <button
            onClick={handleToggleTheme}
            disabled={themeSwitching}
            className="jukebox-theme-toggle"
            title={isCatrina ? t.themeClassic : t.themeNeon}
            aria-label={isCatrina ? t.themeClassic : t.themeNeon}
            aria-busy={themeSwitching}
          >
            <span className="jukebox-theme-toggle-label jukebox-theme-toggle-label-c">C</span>
            <span className="jukebox-theme-toggle-label jukebox-theme-toggle-label-n">N</span>
            {themeSwitching ? (
              <Loader2 size={16} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-brand-gold animate-spin" />
            ) : (
              <div className="jukebox-theme-toggle-knob" />
            )}
          </button>

          <button
            onClick={() => setLang('es')}
            className={`text-sm sm:text-lg transition-opacity ${lang === 'es' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
            title="Español"
          >
            ESP
          </button>
          <button
            onClick={() => setLang('en')}
            className={`text-sm sm:text-lg transition-opacity ${lang === 'en' ? 'opacity-100 border-b-2 border-brand-gold' : 'opacity-40'}`}
            title="English"
          >
            ENG
          </button>
        </div>
      </div>
    </header>
  );
}
