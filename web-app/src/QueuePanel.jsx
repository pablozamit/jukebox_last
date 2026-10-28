import { ChevronDown, ChevronUp, Flame, Heart, Trash2, Users } from 'lucide-react';
import { CornerFlourish } from './Ornaments';

export default function QueuePanel({
  isCatrina,
  mainTextClass,
  queueSongs,
  topSongId,
  nowPlaying,
  userVotes,
  userProposals,
  favorites,
  cooldowns,
  currentTimestamp,
  maxVotes,
  isBridgeActive,
  lastVotedSongId,
  activeUsersCount,
  isQueueCollapsed,
  onToggleCollapse,
  onToggleFavorite,
  onRemoveAction,
  handleVote,
  voteButtonRefs,
  voteCountRefs,
  t,
}) {
  return (
    <div className={`jukebox-queue ${isCatrina ? 'relative' : ''}`}>
      {isCatrina && (
        <>
          <CornerFlourish position="tl" size={24} />
          <CornerFlourish position="tr" size={24} />
        </>
      )}
      <div
        onClick={onToggleCollapse}
        className="jukebox-queue-header"
      >
        <div className="flex items-center gap-4">
          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>{t.nextInQueue}</span>
          <div className="flex items-center gap-1.5">
            <Users size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
            <span className={`text-[10px] font-bold ${isCatrina ? 'text-brand-gold/50' : 'text-brand-neon-purple/70'}`}>{activeUsersCount}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${isCatrina ? 'text-brand-gold/50' : 'text-brand-neon-purple/70'}`}>{queueSongs.length}</span>
          {isQueueCollapsed ? <ChevronDown size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} /> : <ChevronUp size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />}
        </div>
      </div>
      {!isQueueCollapsed && (
        <div className={`max-h-[35vh] overflow-y-auto custom-scrollbar ${isCatrina ? 'divide-y divide-white/[0.03]' : 'divide-y divide-zinc-800/50'}`}>
          {queueSongs.map((song) => {
            const isTop = song.id === topSongId;
            const isNowPlaying = (nowPlaying?.songId && nowPlaying.songId === song.id) || (!nowPlaying?.songId && nowPlaying?.title === song.title);
            const limitReached = userVotes.length >= maxVotes;
            const hasVoted = userVotes.includes(song.id);
            const hasProposed = userProposals.includes(song.id);
            const songCooldown = cooldowns[song.id];
            const isCoolingDown = songCooldown && (currentTimestamp - songCooldown < 3600000);
            const minutesLeft = isCoolingDown ? Math.ceil((3600000 - (currentTimestamp - songCooldown)) / 60000) : 0;

            return (
              <div
                key={`queue-${song.id}`}
                className={`jukebox-queue-item ${isTop ? 'jukebox-queue-item-top' : 'bg-transparent hover:bg-white/5'}`}
              >
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-bold truncate ${mainTextClass}`}>
                    {song.title}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Flame size={12} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
                    <span
                      ref={(node) => node ? voteCountRefs.current.set(song.id, node) : voteCountRefs.current.delete(song.id)}
                      className={`text-xs font-medium ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} ${lastVotedSongId === song.id ? 'vote-count-pop' : ''}`}
                    >
                      {song.votes} {song.votes === 1 ? t.vote : t.votes}
                    </span>
                  </div>
                  {song.proposerName && (
                    <span className={`block text-[10px] mt-0.5 ${isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}`}>
                      {t.proposedBy}{song.proposerName}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => onToggleFavorite(song.id)}
                  className={`shrink-0 p-1.5 transition-all ${favorites.includes(song.id) ? 'text-red-500' : isCatrina ? 'text-brand-gold/25 hover:text-brand-gold' : 'text-zinc-600 hover:text-red-400'}`}
                  title={favorites.includes(song.id) ? t.removeFromFavorites : t.addToFavorites}
                >
                  <Heart size={16} className={favorites.includes(song.id) ? 'fill-current' : ''} />
                </button>

                {(hasVoted || hasProposed) && (
                  <button
                    onClick={() => onRemoveAction(song.id)}
                    className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                    title={t.removeFromQueue}
                    aria-label={t.removeFromQueue}
                  >
                    <Trash2 size={18} />
                  </button>
                )}

                <button
                  ref={(node) => node ? voteButtonRefs.current.set(song.id, node) : voteButtonRefs.current.delete(song.id)}
                  onClick={() => handleVote(song)}
                  disabled={isNowPlaying || limitReached || !isBridgeActive || isCoolingDown}
                  className={`jukebox-btn-vote ${lastVotedSongId === song.id ? 'vote-pop' : ''} ${isNowPlaying || !isBridgeActive || isCoolingDown || limitReached ? 'jukebox-btn-vote-disabled' : 'jukebox-btn-vote-active'}`}
                >
                  {isNowPlaying
                    ? t.nowPlayingBtn
                    : isCoolingDown
                      ? `${minutesLeft} ${t.cooldown}`
                      : t.voteButton}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
