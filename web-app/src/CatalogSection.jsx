import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { Heart, Music2, Plus, Search } from 'lucide-react';
import { db } from './firebase';
import { CATALOG_PAGE_SIZE } from './constants';
import { useToast } from './Toast';
import { SectionHeader } from './Ornaments';

const validateYoutubeUrl = (url) => {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url);
};

export default function CatalogSection({
  isCatrina,
  mainTextClass,
  catalogFilter,
  setCatalogFilter,
  setVisibleCount,
  searchTerm,
  filteredCatalog,
  visibleCatalog,
  visibleCount,
  isBridgeActive,
  favorites,
  onToggleFavorite,
  handleVote,
  userProposals,
  maxProposals,
  cooldowns,
  currentTimestamp,
  nowPlaying,
  userId,
  voteButtonRefs,
  t,
}) {
  const toast = useToast();
  const [suggested, setSuggested] = useState(false);
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestYoutubeUrl, setSuggestYoutubeUrl] = useState('');

  const handleSuggest = async () => {
    const titleToSuggest = suggestTitle || searchTerm;
    if (!titleToSuggest || !userId || !validateYoutubeUrl(suggestYoutubeUrl)) return;
    try {
      await addDoc(collection(db, 'suggestions'), {
        title: titleToSuggest,
        youtubeUrl: suggestYoutubeUrl,
        timestamp: new Date().getTime(),
        userId
      });
      setSuggested(true);
      setSuggestTitle('');
      setSuggestYoutubeUrl('');
      setTimeout(() => setSuggested(false), 3000);
    } catch (error) {
      toast(t.firebaseError + error.message, 'error');
    }
  };

  return (
    <section className="space-y-3 pt-2">
      <SectionHeader label={t.songCatalog} />

      <div className="flex gap-2">
        {[
          { id: 'all', label: t.allTab },
          { id: 'favorites', label: `♥ ${t.favoritesTab}` },
          { id: 'mine', label: t.mySongsTab },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => { setCatalogFilter(f.id); setVisibleCount(CATALOG_PAGE_SIZE); }}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
              catalogFilter === f.id
                ? isCatrina ? 'bg-brand-gold/15 border-brand-gold/50 text-brand-gold' : 'bg-brand-neon-purple/15 border-brand-neon-purple/50 text-brand-neon-purple'
                : isCatrina ? 'border-brand-gold/15 text-brand-gold/40 hover:text-brand-gold' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredCatalog.length === 0 ? (
        catalogFilter !== 'all' && searchTerm === '' ? (
          <p className={`text-center py-10 text-sm ${isCatrina ? 'text-brand-gold/30' : 'text-zinc-600'}`}>
            {catalogFilter === 'favorites' ? t.favoritesEmpty : t.mySongsEmpty}
          </p>
        ) : searchTerm !== '' ? (
          <div className={`jukebox-suggest-card ${isCatrina ? '' : 'bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-4'}`}>
            <div className="flex justify-center">
              <Music2 size={40} className={isCatrina ? 'text-brand-gold/20' : 'text-zinc-700'} />
            </div>
            <div className="space-y-2">
              <h3 className={`text-lg font-bold ${mainTextClass}`}>{t.suggestTitle}</h3>
              <p className={isCatrina ? 'text-brand-gold/40 text-sm' : 'text-zinc-400 text-sm'}>{t.suggestYoutubeNotice}</p>
            </div>

            <div className="space-y-3 text-left">
              <input
                type="text"
                placeholder={t.suggestSongPlaceholder}
                value={suggestTitle || searchTerm}
                onChange={(e) => setSuggestTitle(e.target.value)}
                className={isCatrina ? 'jukebox-input' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white text-sm focus:border-brand-neon-purple focus:outline-none transition-all'}
              />
              <div className="relative">
                <input
                  type="text"
                  placeholder={t.suggestYoutubeUrlPlaceholder}
                  value={suggestYoutubeUrl}
                  onChange={(e) => setSuggestYoutubeUrl(e.target.value)}
                  className={isCatrina ? 'jukebox-input pr-10' : 'w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 pr-10 text-white text-sm focus:border-brand-neon-purple focus:outline-none transition-all'}
                />
                {validateYoutubeUrl(suggestYoutubeUrl) && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-neon-green">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                )}
              </div>

              <button
                onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(suggestTitle || searchTerm)} videoclip`, '_blank')}
                className={`w-full py-2 border rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${isCatrina ? 'border-brand-gold/25 text-brand-gold hover:bg-brand-gold/8' : 'border-brand-gold/30 text-brand-gold hover:bg-brand-gold/10'}`}
              >
                <Search size={14} />
                {t.suggestSearchYoutube}
              </button>
            </div>

            <button
              onClick={handleSuggest}
              disabled={!isBridgeActive || !validateYoutubeUrl(suggestYoutubeUrl)}
              className={`w-full py-4 rounded-xl font-bold transition-all ${
                suggested
                  ? 'bg-brand-neon-green/20 text-brand-neon-green'
                  : !isBridgeActive || !validateYoutubeUrl(suggestYoutubeUrl)
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : isCatrina
                      ? 'jukebox-btn-primary'
                      : 'bg-brand-gold text-zinc-950 hover:scale-[1.02] active:scale-95'
              }`}
            >
              {suggested ? t.suggestSuccess : t.suggestButton}
            </button>
          </div>
        ) : (
          <p className={`text-center py-10 ${isCatrina ? 'text-brand-gold/15' : 'text-zinc-600'}`}>{t.noResults}</p>
        )
      ) : (
        <div>
        {visibleCatalog.map((song) => {
          const isNowPlaying = (nowPlaying?.songId && nowPlaying.songId === song.id) || (!nowPlaying?.songId && nowPlaying?.title === song.title);
          const limitReached = userProposals.length >= maxProposals;
          const songCooldown = cooldowns[song.id];
          const isCoolingDown = songCooldown && (currentTimestamp - songCooldown < 3600000);
          const minutesLeft = isCoolingDown ? Math.ceil((3600000 - (currentTimestamp - songCooldown)) / 60000) : 0;

          return (
            <div
              key={song.id}
              data-reveal
              className={`catalog-reveal-item flex items-center gap-3 p-3 transition-colors ${isCatrina ? 'jukebox-catalog-item hover:bg-brand-gold/5' : 'rounded-xl bg-transparent hover:bg-zinc-900 border border-transparent hover:border-zinc-800'}`}
            >
              <div className="flex-1 min-w-0">
                <h4 className={`text-sm font-medium truncate ${mainTextClass}`}>
                  {song.title}
                </h4>
                <span className={isCatrina ? 'text-brand-gold/25 text-xs' : 'text-zinc-600 text-xs'}>
                  {t.noVotes}
                </span>
              </div>

              <button
                onClick={() => onToggleFavorite(song.id)}
                className={`p-2 transition-all shrink-0 ${favorites.includes(song.id) ? 'text-red-500' : isCatrina ? 'text-brand-gold/30 hover:text-brand-gold' : 'text-zinc-600 hover:text-red-400'}`}
                title={favorites.includes(song.id) ? t.removeFromFavorites : t.addToFavorites}
              >
                <Heart size={18} className={favorites.includes(song.id) ? 'fill-current' : ''} />
              </button>

              <button
                ref={(node) => node ? voteButtonRefs.current.set(song.id, node) : voteButtonRefs.current.delete(song.id)}
                onClick={() => handleVote(song)}
                disabled={isNowPlaying || limitReached || !isBridgeActive || isCoolingDown}
                className={`jukebox-btn-add ${isNowPlaying || !isBridgeActive || isCoolingDown || limitReached ? 'jukebox-btn-add-disabled' : 'jukebox-btn-add-active'}`}
              >
                {!isNowPlaying && !limitReached && !isCoolingDown && isBridgeActive && <Plus size={16} className="mr-1" />}
                {isNowPlaying
                  ? t.nowPlayingBtn
                  : isCoolingDown
                    ? `${minutesLeft} ${t.cooldown}`
                    : t.add}
              </button>
            </div>
          );
        })}
        {visibleCount < filteredCatalog.length && (
          <button
            onClick={() => setVisibleCount(c => c + CATALOG_PAGE_SIZE)}
            className={`w-full mt-2 py-3 rounded-xl border text-sm font-bold transition-all ${isCatrina ? 'border-brand-gold/25 text-brand-gold hover:bg-brand-gold/10' : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900'}`}
          >
            {t.showMoreSongs.replace('{count}', filteredCatalog.length - visibleCount)}
          </button>
        )}
        </div>
      )}
    </section>
  );
}
