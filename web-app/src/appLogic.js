import {
  GUEST_MAX_PROPOSALS,
  REGISTERED_MAX_PROPOSALS,
  GUEST_MAX_VOTES,
  REGISTERED_MAX_VOTES,
} from './constants.js';

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

export function timestampMillis(value) {
  try {
    const millis = typeof value === 'number' ? value : value?.toMillis?.();
    return Number.isFinite(millis) && millis > 0 ? millis : 0;
  } catch {
    return 0;
  }
}
// Bonuses have historically been persistent extra concurrent slots. Keep the
// calculation identical in the display and the transaction's fresh profile.
export function tokenLimits(user = {}) {
  const bonus = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {
    proposals: (user.isRegistered ? REGISTERED_MAX_PROPOSALS : GUEST_MAX_PROPOSALS) + bonus(user.freeProposals),
    votes: (user.isRegistered ? REGISTERED_MAX_VOTES : GUEST_MAX_VOTES) + bonus(user.freeVotes),
  };
}
