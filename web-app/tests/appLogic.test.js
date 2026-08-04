import test from 'node:test';
import assert from 'node:assert/strict';
import { isSongPlaying, nextTriviaWindow, resolveSongId } from '../src/appLogic.js';

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
