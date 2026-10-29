import { ChevronDown, ChevronUp } from 'lucide-react';

export default function ActivityTicker({ isCatrina, activityEvents, activityFeedUnavailable, playedHistory, isTickerCollapsed, onToggleCollapse, t }) {
  return (
    <div className={`jukebox-activity-ticker ${isCatrina ? 'jukebox-activity-ticker-catrina' : ''}`}>
      <div
        onClick={onToggleCollapse}
        className="jukebox-ticker-header"
      >
        <div className="flex items-center gap-2">
          <span className={`relative flex h-1.5 w-1.5`}>
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${isCatrina ? 'bg-brand-gold' : 'bg-brand-neon-purple'}`} />
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isCatrina ? 'bg-brand-gold' : 'bg-brand-neon-purple'}`} />
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>{t.activityTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${isCatrina ? 'text-brand-gold/50' : 'text-brand-neon-purple/70'}`}>{activityEvents.length}</span>
          {isTickerCollapsed
            ? <ChevronDown size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />
            : <ChevronUp size={14} className={isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'} />}
        </div>
      </div>
      {!isTickerCollapsed && (
        <>
          {playedHistory.length > 0 && (
            <div className="jukebox-ticker-played">
              {playedHistory.slice(0, 4).map((p, i) => (
                <span key={`played-${p.title}-${i}`} className={`jukebox-ticker-chip ${isCatrina ? 'jukebox-ticker-chip-catrina' : ''}`}>
                  ♪ {p.title}
                </span>
              ))}
            </div>
          )}
          {activityEvents.length > 0 ? (
            <div className="jukebox-ticker-events">
              <span className={`jukebox-ticker-dot ${isCatrina ? 'text-brand-gold' : 'text-brand-neon-purple'}`}>●</span>
              <div className="jukebox-ticker-scroll">
                <div className="jukebox-ticker-scroll-inner">
                  {activityEvents.map((e, i) => (
                    <span key={`ev-${e.title}-${e.ts}-${i}`} className={`jukebox-ticker-event ${isCatrina ? 'text-brand-gold/70' : 'text-zinc-400'}`}>
                      {e.type === 'proposal' ? '🎵' : '♥'} {e.name} {e.type === 'proposal' ? t.activityProposedShort : t.activityVotedShort} '{e.title}'
                    </span>
                  ))}
                  {activityEvents.map((e, i) => (
                    <span key={`ev-dup-${e.title}-${e.ts}-${i}`} className={`jukebox-ticker-event ${isCatrina ? 'text-brand-gold/70' : 'text-zinc-400'}`}>
                      {e.type === 'proposal' ? '🎵' : '♥'} {e.name} {e.type === 'proposal' ? t.activityProposedShort : t.activityVotedShort} '{e.title}'
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <span className={`jukebox-ticker-event ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>{activityFeedUnavailable ? (t.activityUnavailable || "Actividad no disponible") : t.noActivity}</span>
          )}
        </>
      )}
    </div>
  );
}
