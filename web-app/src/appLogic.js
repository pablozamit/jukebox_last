export function resolveSongId(nowPlaying, songs = []) {
  if (!nowPlaying) return null;
  if (nowPlaying.songId) return nowPlaying.songId;
  if (!nowPlaying.title) return null;
  const match = songs.find((song) => song?.title === nowPlaying.title);
  return match?.id || null;
}

export function isSongPlaying(nowPlaying, song) {
  if (!nowPlaying || !song) return false;
  return nowPlaying.songId
    ? nowPlaying.songId === song.id
    : nowPlaying.title === song.title;
}

export function nextTriviaWindow(now, windowMs) {
  return (Math.floor(now / windowMs) + 1) * windowMs;
}
