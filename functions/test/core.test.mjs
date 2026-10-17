import test from 'node:test';
import assert from 'node:assert/strict';
import { leaseEnd, moveBucket, initialSocial, allowedLegacy, unknownLegacy, assertCatalogItem, requireAuth, level } from '../src/core.mjs';
import { eventId, eventValid, votingStreak, madridHour } from '../src/events.mjs';

test('presence expiry is minute boundary plus two minutes; bucket transitions stay exact', () => {
  const now = Date.UTC(2026, 9, 17, 20, 23, 12), expiresAt = leaseEnd(now);
  assert.equal(expiresAt, Date.UTC(2026, 9, 17, 20, 26));
  const old = { visible: true, expiresAt }, next = { visible: true, expiresAt: expiresAt + 60_000 };
  assert.deepEqual(moveBucket({ buckets: { [expiresAt]: 1 } }, old, next, now), { [expiresAt + 60_000]: 1 });
  assert.deepEqual(moveBucket({ buckets: { [expiresAt]: 1 } }, old, null, expiresAt), {});
});

test('legacy grants are bounded to known IDs and starter inventory has a default outfit', () => {
  assert.deepEqual(allowedLegacy(['first_vote', 'first_vote', 'unknown']), ['first_vote']);
  assert.deepEqual(unknownLegacy(['first_vote', 'unknown']), ['unknown']);
  assert.equal(initialSocial(42).equipped.top, 'tee-cream');
  assert.equal(assertCatalogItem('jacket-dj').price, 200);
  assert.throws(() => assertCatalogItem('fake'), { code: 'invalid-argument' });
});

test('registration decision is from Auth token', () => {
  assert.throws(() => requireAuth({ uid: 'a', token: { firebase: { sign_in_provider: 'anonymous' } } }), { code: 'permission-denied' });
  assert.equal(requireAuth({ uid: 'a', token: { email: 'a@example.test', firebase: { sign_in_provider: 'password' } } }), 'a');
});

test('DJ levels use the existing profile thresholds', () => {
  assert.deepEqual([0, 99, 100, 499, 500, 1999, 2000, 4999, 5000].map(level), [1, 1, 2, 2, 3, 3, 4, 4, 5]);
});

test('event IDs and certified metadata are deterministic', () => {
  const e = { schemaVersion: 1, kind: 'vote', uid: 'dj-alba', songId: 'song1', sessionId: '2026-10-17',
    occurredAt: '2026-10-17T18:30:00Z', certifiedAt: '2026-10-17T18:30:05Z', sourceId: 'source1' };
  assert.equal(eventValid(e, eventId(e)), true);
  assert.equal(eventValid(e, 'wrong'), false);
  const peak = { ...e, kind: 'peak', peakVotes: 10 };
  assert.equal(eventValid(peak, eventId(peak)), true);
  assert.equal(eventValid({ ...peak, peakVotes: 9 }, eventId(peak)), false);
  assert.equal(madridHour(e.occurredAt), 20);
  assert.equal(votingStreak(['2026-10-17', '2026-10-18', '2026-10-20']), 2);
});
