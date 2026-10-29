import test from 'node:test';
import assert from 'node:assert/strict';
import { triviaPresentation } from '../src/triviaState.js';

const windowMs = 30 * 60 * 1000;
const now = 10 * windowMs;
const state = overrides => triviaPresentation({ userId: 'dj', isRegistered: true, showModal: false, now, answeredAt: 0, lastTriviaAt: 0, windowMs, ...overrides });

test('answer stays visible until the trivia dialog closes', () => {
  assert.deepEqual(state({ showModal: true, answeredAt: now }), { showGift: false, showDialog: true, answered: true });
  assert.deepEqual(state({ answeredAt: now }), { showGift: false, showDialog: false, answered: true });
});

test('trivia cooldown lasts thirty minutes across time-window boundaries', () => {
  assert.equal(state({ answeredAt: now - 1 }).showGift, false);
  assert.equal(state({ lastTriviaAt: { toMillis: () => now - windowMs + 1 } }).showGift, false);
  assert.equal(state({ answeredAt: now - windowMs }).showGift, true);
});

test('anonymous users cannot open the trivia dialog', () => {
  assert.equal(state({ isRegistered: false, showModal: true }).showDialog, false);
  assert.equal(state({ userId: '', showModal: true }).showDialog, false);
});
