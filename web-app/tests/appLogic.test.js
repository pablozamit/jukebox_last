import test from 'node:test';
import assert from 'node:assert/strict';
import { isSongPlaying, nextTriviaWindow, resolveSongId, timestampMillis, tokenLimits } from '../src/appLogic.js';

test('token limits include earned bonuses for guests and registered users', () => {
  assert.deepEqual(tokenLimits(), { proposals: 3, votes: 5 });
  assert.deepEqual(tokenLimits({ isRegistered: true, freeProposals: 1, freeVotes: 3 }), { proposals: 7, votes: 13 });
  assert.deepEqual(tokenLimits({ freeProposals: 2, freeVotes: 1 }), { proposals: 5, votes: 6 });
  assert.deepEqual(tokenLimits({ freeProposals: '2', freeVotes: -1 }), { proposals: 3, votes: 5 });
});

test('resolveSongId prefers the bridge songId', () => {
  const songs = [{ id: 'file.mp4', title: 'Same title' }];
  assert.equal(resolveSongId({ songId: 'other.mp4', title: 'Same title' }, songs), 'other.mp4');
});

test('resolveSongId falls back to catalog title for legacy bridge state', () => {
  const songs = [{ id: 'file.mp4', title: 'Legacy title' }];
  assert.equal(resolveSongId({ title: 'Legacy title' }, songs), 'file.mp4');
});

test('isSongPlaying supports both new and legacy state', () => {
  const song = { id: 'file.mp4', title: 'A song' };
  assert.equal(isSongPlaying({ songId: 'file.mp4', title: 'A song' }, song), true);
  assert.equal(isSongPlaying({ title: 'A song' }, song), true);
  assert.equal(isSongPlaying({ songId: 'other.mp4', title: 'A song' }, song), false);
});

test('nextTriviaWindow returns the next half-hour boundary', () => {
  const windowMs = 30 * 60 * 1000;
  assert.equal(nextTriviaWindow(1, windowMs), windowMs);
  assert.equal(nextTriviaWindow(windowMs, windowMs), windowMs * 2);
});

test('trivia accepts numeric persisted times and legacy Timestamp without a render exception', () => {
  assert.equal(timestampMillis(1792250000000), 1792250000000);
  assert.equal(timestampMillis({ toMillis: () => 1792250000000 }), 1792250000000);
  for (const bad of [null, undefined, NaN, Infinity, -1, '123', {}, { toMillis: () => { throw new Error('bad data'); } }]) {
    assert.equal(timestampMillis(bad), 0);
  }
});
