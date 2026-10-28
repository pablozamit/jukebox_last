import { Disc3, Heart, Music2 } from 'lucide-react';
import { resolveSongId } from './appLogic';
import { CornerFlourish } from './Ornaments';

export default function NowPlayingCard({
  npCardRef,
  discRef,
  heartRef,
  nowPlaying,
  isBridgeActive,
  isCatrina,
  mainTextClass,
  activeQueue,
  userVotes,
  cooldowns,
  currentTimestamp,
  maxVotes,
  handleVote,
  isStaffHours,
  calculateElapsed,
  calculateProgress,
  formatTime,
  t,
}) {
  return (
    <section ref={npCardRef} className="jukebox-np">
      {!isCatrina && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-neon-purple/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
      )}
      {isCatrina && (
        <>
          <CornerFlourish position="tl" size={36} />
          <CornerFlourish position="tr" size={36} />
          <CornerFlourish position="bl" size={36} />
          <CornerFlourish position="br" size={36} />
        </>
      )}

      <div className={`jukebox-np-label ${isCatrina ? 'relative z-[1]' : ''}`}>
        <Music2 size={16} className={isBridgeActive ? "animate-pulse" : ""} />
        {t.nowPlaying}
      </div>

      {isBridgeActive ? (
        <div className={`jukebox-np-content ${isCatrina ? 'relative z-[1]' : ''}`}>
          <h3 className={`jukebox-np-title text-xl font-bold mb-2 line-clamp-2 leading-tight ${mainTextClass}`}>
            {nowPlaying?.title || t.autoMode}
          </h3>

          {/* === HEART: pulso lento + burst cuando alguien vota en tiempo real === */}
          {nowPlaying?.title && (() => {
            const npSong = Object.values(activeQueue).find(s => resolveSongId(nowPlaying, [s]) === s.id && s.votes > 0);
            if (!npSong) return null;

            const hasVotedForCurrentSong = userVotes.includes(npSong.id);
            const songCooldown = cooldowns[npSong.id];
            const isCoolingDown = songCooldown && (currentTimestamp - songCooldown < 3600000);
            const limitReached = userVotes.length >= maxVotes;
            const isDisabled = hasVotedForCurrentSong || limitReached || !isBridgeActive || isCoolingDown;

            return (
              <div className={`jukebox-np-vote flex items-center justify-center gap-2 mb-3 ${isCatrina ? 'relative z-[1]' : ''}`}>
                <button
                  onClick={() => handleVote(npSong)}
                  disabled={hasVotedForCurrentSong || limitReached || !isBridgeActive || isCoolingDown}
                  className={`jukebox-heart-button jukebox-heart-icon p-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${hasVotedForCurrentSong ? 'text-red-500' : (isCatrina ? 'text-brand-gold/25 hover:text-brand-gold' : 'text-zinc-600 hover:text-red-400')} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={hasVotedForCurrentSong ? t.alreadyVotedNowPlaying : (isDisabled ? t.voteDisabledNowPlaying : t.voteNowPlaying)}
                  aria-label={hasVotedForCurrentSong ? t.alreadyVotedNowPlaying : (isDisabled ? t.voteDisabledNowPlaying : t.voteNowPlaying)}
                >
                  <div ref={heartRef}>
                    <Heart size={22} className={hasVotedForCurrentSong ? "fill-current" : ""} />
                  </div>
                </button>
                <span className={`text-xs font-medium ${isCatrina ? 'text-brand-gold/60' : 'text-zinc-400'}`}>
                  {npSong.votes} {npSong.votes === 1 ? t.likeSingular : t.likesPlural}
                  {npSong.proposerName && (
                    <span className={isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}> → {npSong.proposerName}</span>
                  )}
                </span>
              </div>
            );
          })()}

          <div ref={discRef} className={`jukebox-np-disc-wrap mx-auto my-4 ${isCatrina ? 'jukebox-np-disc' : 'text-brand-neon-purple opacity-80'}`}>
            <Disc3 size={isCatrina ? 56 : 48} />
          </div>

          <div className="jukebox-np-progress space-y-2 text-left">
            <div className="jukebox-np-bar">
              <div
                className="jukebox-np-bar-fill transition-all duration-1000 ease-linear"
                style={{ width: `${calculateProgress()}%` }}
              />
            </div>
            <div className={`flex justify-between text-xs font-medium ${isCatrina ? 'text-brand-gold/50' : 'text-zinc-500'}`}>
              <span>{nowPlaying ? formatTime(calculateElapsed()) : '00:00'}</span>
              <span>{nowPlaying ? formatTime(nowPlaying.totalTime) : '00:00'}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`py-4 ${isCatrina ? 'relative z-[1]' : ''}`}>
          {isStaffHours ? (
            <>
              <h3 className={`text-xl font-bold mb-2 ${mainTextClass}`}>{t.staffModeTitle}</h3>
              <p className={isCatrina ? 'text-brand-gold/40 text-sm' : 'text-zinc-400 text-sm'}>{t.staffModeDesc}</p>
            </>
          ) : (
            <>
              <h3 className={`text-xl font-bold mb-2 ${mainTextClass}`}>{t.closedTitle}</h3>
              <p className={isCatrina ? 'text-brand-gold/40 text-sm' : 'text-zinc-400 text-sm'}>{t.closedDesc}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
