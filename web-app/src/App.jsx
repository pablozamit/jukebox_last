import { useEffect, useState, lazy, Suspense, useMemo } from 'react';
import { collection, doc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, SOCIAL_MAP_ENABLED, IS_LOCAL_DEMO } from './firebase';
import { translations } from './translations';
import { useTheme } from './ThemeContext';
import { useToast } from './Toast';
import { TextureOverlay, OrnamentalDivider } from './Ornaments';
import TriviaGift from './TriviaGift';
import HeaderBar from './HeaderBar';
import LastCallBanner from './LastCallBanner';
import NowPlayingCard from './NowPlayingCard';
import NightlyTopBanner from './NightlyTopBanner';
import QueuePanel from './QueuePanel';
import ActivityTicker from './ActivityTicker';
import CatalogSection from './CatalogSection';
import HelpModal from './HelpModal';
import PlayingBanner from './PlayingBanner';
import AuthModal from './AuthModal';
import OutOfTokensModal from './OutOfTokensModal';
import DesignSurveyModal from './DesignSurveyModal';
import { Search, X, HelpCircle, ArrowUp } from 'lucide-react';
import { useServerTime } from './hooks/useServerTime';
import { useJukeboxData } from './hooks/useJukeboxData';
import { useUserSession } from './hooks/useUserSession';
import { useCatalogView } from './hooks/useCatalogView';
import { useGsapEffects } from './hooks/useGsapEffects';
import { useThemeSwitch } from './hooks/useThemeSwitch';
import { useDesignSurvey } from './hooks/useDesignSurvey';
import { useNotifications } from './hooks/useNotifications';
import {
  CATALOG_PAGE_SIZE,
  GUEST_MAX_PROPOSALS,
  REGISTERED_MAX_PROPOSALS,
  GUEST_MAX_VOTES,
  REGISTERED_MAX_VOTES,
} from './constants';

const Profile = lazy(() => import('./Profile'));
const StatsModal = lazy(() => import('./StatsModal'));
const SocialMapPanel = lazy(() => import('./SocialMapPanel'));

export default function App() {
  const { theme } = useTheme();
  const toast = useToast();
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'es');
  const t = translations[lang];

  const { getServerTime, currentTime } = useServerTime();

  const { catalog, loading, activeQueue, nowPlaying, cooldowns, activeUsersCount, playedHistory, nightlyTop } = useJukeboxData({ toast, t });

  const {
    userId,
    isRegistered,
    userData,
    userProposals,
    userVotes,
    showRegister,
    setShowRegister,
    showLogin,
    setShowLogin,
    showProfile,
    setShowProfile,
    regEmail,
    setRegEmail,
    regPassword,
    setRegPassword,
    regDjName,
    setRegDjName,
    authErrorMsg,
    setAuthErrorMsg,
    authMode,
    setAuthMode,
    handleRegister,
    handleLogin,
    handleForgotPassword,
    handleLogout,
  } = useUserSession({ toast, t });

  const favorites = useMemo(() => userData?.favorites || [], [userData?.favorites]);

  const [showHelp, setShowHelp] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [showScroll, setShowScroll] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [isTickerCollapsed, setIsTickerCollapsed] = useState(false);
  const [showLastCall, setShowLastCall] = useState(true);
  const [showOutTokenCTA, setShowOutTokenCTA] = useState(false);

  const {
    searchTerm,
    setSearchTerm,
    catalogFilter,
    setCatalogFilter,
    visibleCount,
    setVisibleCount,
    queueSongs,
    filteredCatalog,
    visibleCatalog,
    topSongId,
  } = useCatalogView({ catalog, activeQueue, favorites, userProposals, userVotes });

  const currentTimestamp = currentTime;
  const isBridgeActive = nowPlaying?.lastActive
    ? (currentTimestamp - nowPlaying.lastActive < 300000)
    : false;

  const {
    discRef,
    countersRef,
    npCardRef,
    heartRef,
    voteButtonRefs,
    voteCountRefs,
    lastVotedSongId,
    setLastVotedSongId,
    animateVote,
  } = useGsapEffects({
    nowPlaying,
    activeQueue,
    isBridgeActive,
    catalog,
    searchTerm,
    isQueueCollapsed,
    userProposals,
    userVotes,
  });

  const checkIsStaffHours = () => {
    const now = new Date(currentTime);
    const day = now.getDay();
    const time = now.getHours() + now.getMinutes() / 60;
    const isEveningOpen = day >= 1 && day <= 6 && time >= 19;
    const isMorningOpen = (day >= 2 || day === 0) && time <= 1.5;
    return isEveningOpen || isMorningOpen;
  };
  const isStaffHours = checkIsStaffHours();

  const {
    activityEvents,
    isLastCall,
    showPlayingBanner,
    playingBannerData,
    closePlayingBanner,
    ownVoteRef,
    lastVoteCountsRef,
    lastManualRemoveRef,
  } = useNotifications({
    userId,
    userData,
    userProposals,
    activeQueue,
    catalog,
    queueSongs,
    nowPlaying,
    isBridgeActive,
    currentTime,
    isStaffHours,
    t,
    toast,
    getServerTime,
  });

  const { themeSwitching, handleToggleTheme } = useThemeSwitch({ t, toast });
  const { showDesignSurvey, surveySubmitted, submitDesignSurvey, dismissSurvey } = useDesignSurvey({ theme, userId });

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScroll(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const djDisplayName = (userData?.djName && userData.djName.trim()) ? userData.djName.trim() : t.anonymous;

  const toggleFavorite = (songId) => {
    if (!userId) {
      toast(t.authError, 'error');
      return;
    }
    const next = favorites.includes(songId)
      ? favorites.filter(id => id !== songId)
      : [...favorites, songId];
    setDoc(doc(db, 'users', userId), { favorites: next }, { merge: true })
      .catch((error) => toast(t.firebaseError + error.message, 'error'));
  };

  const MAX_PROPOSALS = (isRegistered ? REGISTERED_MAX_PROPOSALS : GUEST_MAX_PROPOSALS) + (userData?.freeProposals || 0);
  const MAX_VOTES = (isRegistered ? REGISTERED_MAX_VOTES : GUEST_MAX_VOTES) + (userData?.freeVotes || 0);

  const handleRemoveAction = async (songId) => {
    if (!userId) return;
    lastManualRemoveRef.current = { songId, at: getServerTime() };
    try {
      const userRef = doc(db, 'users', userId);
      const songRef = doc(db, 'songs', songId);
      await runTransaction(db, async (transaction) => {
        const [userSnap, songSnap] = await Promise.all([
          transaction.get(userRef),
          transaction.get(songRef),
        ]);
        if (!userSnap.exists()) return;

        const currentUser = userSnap.data();
        const currentVotes = currentUser.votes || [];
        const currentProposals = currentUser.proposals || [];
        const hasVote = currentVotes.includes(songId);
        const hasProposal = currentProposals.includes(songId);
        if (!hasVote && !hasProposal) return;

        // Los datos históricos pueden tener el mismo id en ambos arrays. Retiramos
        // solo el token que corresponde a la primera coincidencia, igual que el
        // comportamiento anterior, para no perder dos tokens por una acción.
        const nextVotes = hasVote ? currentVotes.filter(id => id !== songId) : currentVotes;
        const nextProposals = !hasVote && hasProposal
          ? currentProposals.filter(id => id !== songId)
          : currentProposals;

        transaction.set(userRef, {
          proposals: nextProposals,
          votes: nextVotes,
        }, { merge: true });

        if (songSnap.exists()) {
          const currentVotes = songSnap.data().votes || 0;
          if (currentVotes <= 1) transaction.delete(songRef);
          else transaction.update(songRef, { votes: currentVotes - 1 });
        }
      });
    } catch (error) {
      toast(t.firebaseError + error.message, 'error');
    }
  };

  const handleVote = async (song) => {
    if (!userId) {
      toast(t.authError, 'error');
      return;
    }

    // Registro optimista: evita notificarte a ti mismo tu propio voto
    ownVoteRef.current = { songId: song.id, at: getServerTime() };
    let voteWasProposal = false;
    lastVoteCountsRef.current[song.id] = (activeQueue[song.id]?.votes || 0) + 1;
    try {
      const votedAt = serverTimestamp();
      const userRef = doc(db, 'users', userId);
      const songRef = doc(db, 'songs', song.id);

      // Usuario y canción forman una sola operación lógica. Si una de las dos
      // escrituras falla, la transacción revierte ambas y no se consume el voto.
      await runTransaction(db, async (transaction) => {
        const [userSnap, songSnap] = await Promise.all([
          transaction.get(userRef),
          transaction.get(songRef),
        ]);
        const currentUser = userSnap.exists() ? userSnap.data() : {};
        const currentProposals = currentUser.proposals || [];
        const currentVotes = currentUser.votes || [];
        const userIsRegistered = currentUser.isRegistered || false;

        const actualMaxProposals = userIsRegistered ? REGISTERED_MAX_PROPOSALS : GUEST_MAX_PROPOSALS;
        const actualMaxVotes = userIsRegistered ? REGISTERED_MAX_VOTES : GUEST_MAX_VOTES;

        let finalProposals = [...currentProposals];
        let finalVotes = [...currentVotes];
        let shouldIncrementSongVote = false;

        const effectiveIsProposal = !songSnap.exists();
        voteWasProposal = effectiveIsProposal;

        // --- TOKEN LIMIT CHECK --- (Server-side validation)
        if (effectiveIsProposal) {
            if (currentProposals.length >= actualMaxProposals) {
                // User has reached proposal limit, abort transaction
                throw new Error(t.proposalLimitReached);
            }
        } else { // It's a vote
            if (currentVotes.length >= actualMaxVotes) {
                // User has reached vote limit, abort transaction
                throw new Error(t.voteLimitReached);
            }
        }
        // --- END TOKEN LIMIT CHECK ---

        if (effectiveIsProposal) {
            if (finalProposals.includes(song.id)) {
                return; // Ya propuesto, abortar transacción
            }
            finalProposals.push(song.id);
            shouldIncrementSongVote = true;
        } else { // Es un voto
            if (finalVotes.includes(song.id)) {
                return; // Ya votado, abortar transacción
            }
            finalVotes.push(song.id);
            shouldIncrementSongVote = true;
        }

        transaction.set(userRef, {
            proposals: finalProposals,
            votes: finalVotes,
        }, { merge: true });

        if (shouldIncrementSongVote) {
            if (songSnap.exists()) {
                transaction.update(songRef, {
                    votes: (songSnap.data().votes || 0) + 1,
                    ...(effectiveIsProposal ? { proposerName: djDisplayName } : {}),
                });
            } else {
                transaction.set(songRef, {
                    title: song.title,
                    votes: 1,
                    firstVotedAt: votedAt,
                    proposerName: djDisplayName,
                });
            }
        }
        // El evento viaja dentro de la misma transacción que el voto. Las reglas
        // comprueban con getAfter() que usuario y canción cambiaron de verdad;
        // así no se pueden fabricar estadísticas con un addDoc independiente.
        const eventRef = doc(collection(db, 'songs', song.id, 'voteEvents'));
        transaction.set(eventRef, {
          kind: 'vote_event',
          userId,
          songId: song.id,
          title: song.title,
          type: effectiveIsProposal ? 'proposal' : 'vote',
          voterName: userData?.djName?.trim() || 'ANONYMOUS',
          ts: Math.round(getServerTime()),
        });
      });

      // Los contadores los calcula el bridge a partir de este evento confirmado.
      // El navegador no escribe mapas de estadísticas arbitrarios.
      // El bridge limpia votes/proposals del usuario al empezar la cancion;
      // sin este recuerdo local el banner "tu cancion esta sonando" perderia la referencia.
      try {
        const key = 'jb-my-tracks';
        const today = new Date().toDateString();
        const prev = JSON.parse(localStorage.getItem(key) || '{}');
        const mine = prev.date === today ? prev : { date: today, proposals: [], votes: [] };
        const list = voteWasProposal ? mine.proposals : mine.votes;
        if (!list.includes(song.id)) list.push(song.id);
        if (song.title && !list.includes(song.title)) list.push(song.title);
        localStorage.setItem(key, JSON.stringify(mine));
      } catch { /* sin localStorage */ }
      setLastVotedSongId(song.id);
      animateVote(song.id);
    } catch (error) {
      lastVoteCountsRef.current[song.id] = activeQueue[song.id]?.votes || 0;
      let errorMessage = t.firebaseError + error.message;
      if (error.message === "Proposal limit reached.") {
        errorMessage = t.proposalLimitReached;
      } else if (error.message === "Vote limit reached.") {
        errorMessage = t.voteLimitReached;
      } else if (error.message === "Already proposed this song." || error.message === "Already voted for this song.") {
        // These errors are from the idempotency check in the transaction, but should ideally be caught by the UI
        // Fallback if UI check fails
        errorMessage = t.alreadyVoted;
      }
      toast(errorMessage, 'error');
    }
  };

  // B1: el bridge solo escribe nowPlaying una vez por canción (con startedAt, epoch ms);
  // el progreso se calcula en local con el reloj del servidor y se refresca con el tic de 10s.
  const calculateElapsed = () => {
    if (!nowPlaying) return 0;
    let elapsed;
    if (nowPlaying.startedAt) {
      elapsed = (getServerTime() - nowPlaying.startedAt) / 1000;
    } else if (typeof nowPlaying.currentTime === 'number') {
      elapsed = nowPlaying.currentTime; // compatibilidad con nowPlaying antiguos (bridge sin actualizar)
    } else {
      return 0;
    }
    return Math.min(Math.max(elapsed, 0), nowPlaying.totalTime || elapsed);
  };

  const calculateProgress = () => {
    if (!nowPlaying || !nowPlaying.totalTime || nowPlaying.totalTime === 0) return 0;
    return (calculateElapsed() / nowPlaying.totalTime) * 100;
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const isCatrina = theme === 'catrina';
  const baseBgClass = isCatrina ? 'bg-[#0f0d0a]' : 'bg-zinc-950';
  const mainTextClass = isCatrina ? 'text-[#f5ecd7]' : 'text-white';

  if (loading) {
    return (
      <div className={`min-h-screen ${baseBgClass} flex items-center justify-center`}>
        <span className={isCatrina ? 'text-brand-gold font-display tracking-widest' : 'text-brand-gold'}>{t.loading}</span>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-24 font-sans selection:bg-brand-neon-purple/30 jukebox-bg relative ${baseBgClass}`}>
      <TextureOverlay />
      {themeSwitching && <div className="theme-transition-overlay" />}

      {/* ===== HEADER ===== */}
      <HeaderBar
        isRegistered={isRegistered}
        isCatrina={isCatrina}
        lang={lang}
        setLang={setLang}
        themeSwitching={themeSwitching}
        handleToggleTheme={handleToggleTheme}
        onProfileClick={() => { if (isRegistered) setShowProfile(true); else { setAuthMode('login'); setShowLogin(true); } }}
        onStatsClick={() => setShowStats(true)}
        t={t}
      />

      <div className="px-4 pt-3 max-w-lg mx-auto">
        {SOCIAL_MAP_ENABLED && (
          <Suspense fallback={null}>
            <SocialMapPanel
              userId={userId}
              isRegistered={isRegistered}
              userData={userData}
              catalog={catalog}
              lang={lang}
              getServerTime={getServerTime}
              onRegister={() => { setAuthMode('register'); setShowRegister(true); }}
            />
          </Suspense>
        )}
        <a
          href="#jukebox-song-search"
          className={`mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${isCatrina ? 'border-brand-gold/35 bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/15' : 'border-brand-neon-purple/30 bg-brand-neon-purple/10 text-white hover:bg-brand-neon-purple/20'}`}
        >
          <Search size={17} aria-hidden="true" />
          {lang === 'en' ? 'Search or suggest a song' : 'Busca o propone una canción'}
          <ArrowUp size={15} className="rotate-45" aria-hidden="true" />
        </a>
      </div>

      {/* ===== MAIN ===== */}
      <main className="p-4 space-y-6 max-w-lg mx-auto">
        {IS_LOCAL_DEMO && <p className="text-center text-xs text-theme-muted" role="status">{lang === 'en' ? 'Local preview · test data' : 'Vista local · datos de prueba'}</p>}
        <button
          onClick={() => { setHelpStep(0); setShowHelp(true); }}
          className={`w-full flex items-center justify-center gap-2 py-2 transition-colors text-sm font-medium ${isCatrina ? 'text-brand-gold/30 hover:text-brand-gold' : 'text-zinc-500 hover:text-brand-neon-purple'}`}
        >
          <HelpCircle size={18} />
          {t.howItWorks}
        </button>

        {isLastCall && showLastCall && (
          <LastCallBanner isCatrina={isCatrina} t={t} onClose={() => setShowLastCall(false)} />
        )}

        {/* ===== NOW PLAYING ===== */}
        <NowPlayingCard
          npCardRef={npCardRef}
          discRef={discRef}
          heartRef={heartRef}
          nowPlaying={nowPlaying}
          isBridgeActive={isBridgeActive}
          isCatrina={isCatrina}
          mainTextClass={mainTextClass}
          activeQueue={activeQueue}
          userVotes={userVotes}
          cooldowns={cooldowns}
          currentTimestamp={currentTimestamp}
          maxVotes={MAX_VOTES}
          handleVote={handleVote}
          isStaffHours={isStaffHours}
          calculateElapsed={calculateElapsed}
          calculateProgress={calculateProgress}
          formatTime={formatTime}
          t={t}
        />

        {nightlyTop && (
          <NightlyTopBanner nightlyTop={nightlyTop} isCatrina={isCatrina} mainTextClass={mainTextClass} t={t} />
        )}

        {isCatrina && <OrnamentalDivider />}

        {/* ===== STICKY COUNTERS + SEARCH + QUEUE ===== */}
        <div className={`sticky top-[100px] z-40 space-y-4 pb-4 border-b ${isCatrina ? 'border-brand-gold/10 shadow-2xl' : 'border-zinc-800/50 shadow-2xl'} ${baseBgClass}`}>
          <div ref={countersRef} className="flex gap-2">
            <div className={`jukebox-counter ${userProposals.length < 3 ? 'jukebox-counter-proposals' : 'jukebox-counter-spent'}`}>
              {t.proposalsLabel}: {userProposals.length}/{MAX_PROPOSALS}
            </div>
            <div className={`jukebox-counter ${userVotes.length < MAX_VOTES ? 'jukebox-counter-votes' : 'jukebox-counter-spent'}`}>
              {t.votesLabel}: {userVotes.length}/{MAX_VOTES}
            </div>
          </div>

          {(userData?.freeProposals || 0) > 0 && (
            <p className={`text-[10px] font-bold ${isCatrina ? 'text-brand-gold/50' : 'text-brand-neon-purple/60'}`}>
              {t.triviaBonusLine.replace('{p}', userData.freeProposals).replace('{v}', userData.freeVotes || 0)}
            </p>
          )}

          <div className="relative">
            <Search className="jukebox-search-icon" size={20} />
            <input
              id="jukebox-song-search"
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(CATALOG_PAGE_SIZE); }}
              className={`w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-10 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 transition-all ${isCatrina ? 'jukebox-search' : 'focus:border-brand-neon-purple focus:ring-brand-neon-purple'}`}
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); setVisibleCount(CATALOG_PAGE_SIZE); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 hover:text-red-400 p-1"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {queueSongs.length > 0 && (
            <QueuePanel
              isCatrina={isCatrina}
              mainTextClass={mainTextClass}
              queueSongs={queueSongs}
              topSongId={topSongId}
              nowPlaying={nowPlaying}
              userVotes={userVotes}
              userProposals={userProposals}
              favorites={favorites}
              cooldowns={cooldowns}
              currentTimestamp={currentTimestamp}
              maxVotes={MAX_VOTES}
              isBridgeActive={isBridgeActive}
              lastVotedSongId={lastVotedSongId}
              activeUsersCount={activeUsersCount}
              isQueueCollapsed={isQueueCollapsed}
              onToggleCollapse={() => setIsQueueCollapsed(!isQueueCollapsed)}
              onToggleFavorite={toggleFavorite}
              onRemoveAction={handleRemoveAction}
              handleVote={handleVote}
              voteButtonRefs={voteButtonRefs}
              voteCountRefs={voteCountRefs}
              t={t}
            />
          )}
        </div>

        <ActivityTicker
          isCatrina={isCatrina}
          activityEvents={activityEvents}
          playedHistory={playedHistory}
          isTickerCollapsed={isTickerCollapsed}
          onToggleCollapse={() => setIsTickerCollapsed(!isTickerCollapsed)}
          t={t}
        />

        {isCatrina && <OrnamentalDivider />}

        {/* ===== CATALOG ===== */}
        <CatalogSection
          isCatrina={isCatrina}
          mainTextClass={mainTextClass}
          catalogFilter={catalogFilter}
          setCatalogFilter={setCatalogFilter}
          setVisibleCount={setVisibleCount}
          searchTerm={searchTerm}
          filteredCatalog={filteredCatalog}
          visibleCatalog={visibleCatalog}
          visibleCount={visibleCount}
          isBridgeActive={isBridgeActive}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          handleVote={handleVote}
          userProposals={userProposals}
          maxProposals={MAX_PROPOSALS}
          cooldowns={cooldowns}
          currentTimestamp={currentTimestamp}
          nowPlaying={nowPlaying}
          userId={userId}
          voteButtonRefs={voteButtonRefs}
          t={t}
        />
      </main>

      {/* ===== TRIVIA: regalo 3D cada 30 min — solo usuarios registrados ===== */}
      <TriviaGift userId={userId} t={t} lastTriviaAt={userData?.lastTriviaAt || null} isRegistered={isRegistered} getServerTime={getServerTime} />

      {/* ===== HELP MODAL ===== */}
      {showHelp && (
        <HelpModal
          isCatrina={isCatrina}
          mainTextClass={mainTextClass}
          helpStep={helpStep}
          setHelpStep={setHelpStep}
          onClose={() => setShowHelp(false)}
          t={t}
        />
      )}

      {/* ===== SCROLL TO TOP ===== */}
      {showScroll && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className={isCatrina ? 'jukebox-scroll-top' : 'fixed bottom-6 right-6 z-50 w-12 h-12 bg-zinc-900 border border-brand-neon-purple text-brand-neon-purple rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(176,38,255,0.5)] transition-all hover:scale-110 active:scale-95'}
        >
          <ArrowUp size={24} />
        </button>
      )}

      {/* ===== STATS MODAL ===== */}
      {showStats && (
        <Suspense fallback={null}>
          <StatsModal
            onClose={() => setShowStats(false)}
            t={t}
            catalog={catalog}
            isCatrina={isCatrina}
            mainTextClass={mainTextClass}
            getServerTime={getServerTime}
          />
        </Suspense>
      )}

      {/* ===== PLAYING BANNER ===== */}
      {showPlayingBanner && playingBannerData && (
        <PlayingBanner
          isCatrina={isCatrina}
          mainTextClass={mainTextClass}
          data={playingBannerData}
          onClose={closePlayingBanner}
          t={t}
        />
      )}

      {/* ===== REGISTER / LOGIN MODAL ===== */}
      {(showRegister || showLogin) && (
        <AuthModal
          isCatrina={isCatrina}
          authMode={authMode}
          setAuthMode={setAuthMode}
          setAuthErrorMsg={setAuthErrorMsg}
          onClose={() => { setShowRegister(false); setShowLogin(false); }}
          regDjName={regDjName}
          setRegDjName={setRegDjName}
          regEmail={regEmail}
          setRegEmail={setRegEmail}
          regPassword={regPassword}
          setRegPassword={setRegPassword}
          authErrorMsg={authErrorMsg}
          handleRegister={handleRegister}
          handleLogin={handleLogin}
          handleForgotPassword={handleForgotPassword}
          t={t}
        />
      )}

      {/* ===== OUT OF TOKENS CTA ===== */}
      {showOutTokenCTA && !isRegistered && (
        <OutOfTokensModal
          isCatrina={isCatrina}
          onClose={() => setShowOutTokenCTA(false)}
          onRegisterCta={() => { setShowOutTokenCTA(false); setAuthMode('register'); setShowRegister(true); }}
          t={t}
        />
      )}

      {/* ===== DESIGN SURVEY ===== */}
      {showDesignSurvey && (
        <DesignSurveyModal
          isCatrina={isCatrina}
          surveySubmitted={surveySubmitted}
          submitDesignSurvey={submitDesignSurvey}
          dismissSurvey={dismissSurvey}
          t={t}
        />
      )}

      {/* ===== PROFILE ===== */}
      {showProfile && (
        <Suspense fallback={null}>
          <Profile
            userData={userData}
            userId={userId}
            t={t}
            activeQueue={activeQueue}
            onClose={() => setShowProfile(false)}
            onLogout={async () => {
              if (SOCIAL_MAP_ENABLED && isRegistered) {
                try {
                  const { socialRequest } = await import('./socialApi');
                  await socialRequest('hide');
                } catch {
                  // A closed connection cannot be renewed; its server lease expires.
                }
              }
              await handleLogout();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
