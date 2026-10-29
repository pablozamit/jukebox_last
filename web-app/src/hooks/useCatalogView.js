import { useMemo, useState } from 'react';
import { CATALOG_PAGE_SIZE } from '../constants';

export function useCatalogView({ catalog, activeQueue, favorites, userProposals, userVotes }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);

  const mergedSongs = useMemo(() => catalog
    .map(song => ({
      ...song,
      votes: activeQueue[song.id]?.votes || 0,
      firstVotedAt: activeQueue[song.id]?.firstVotedAt || null,
      proposerName: activeQueue[song.id]?.proposerName || null
    }))
    .filter(song => song.available !== false), [catalog, activeQueue]);

  const queueSongs = useMemo(() => mergedSongs
    .filter(song => song.votes > 0)
    .sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return (a.firstVotedAt || 0) - (b.firstVotedAt || 0);
    }), [mergedSongs]);

  const filteredCatalog = useMemo(() => mergedSongs
    .filter(song => song.votes === 0)
    .filter(song => song.title.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(song => {
      if (catalogFilter === 'favorites') return favorites.includes(song.id);
      if (catalogFilter === 'mine') return userProposals.includes(song.id) || userVotes.includes(song.id);
      return true;
    })
    .sort((a, b) => a.title.localeCompare(b.title)), [mergedSongs, searchTerm, catalogFilter, favorites, userProposals, userVotes]);

  const visibleCatalog = filteredCatalog.slice(0, visibleCount);

  const topSongId = queueSongs.length > 0 ? queueSongs[0].id : null;

  return {
    searchTerm,
    setSearchTerm,
    catalogFilter,
    setCatalogFilter,
    visibleCount,
    setVisibleCount,
    mergedSongs,
    queueSongs,
    filteredCatalog,
    visibleCatalog,
    topSongId,
  };
}
