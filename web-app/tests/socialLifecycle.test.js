import test from 'node:test';
import assert from 'node:assert/strict';
import { isActivityCurrent, isInvitationCurrent, isPresenceCurrent, nextSocialExpiry, shouldHeartbeat, socialExpiryDelay } from '../src/socialLifecycle.mjs';

test('presence and activity leases expire from numeric server milliseconds', () => {
  assert.equal(isPresenceCurrent({ expiresAt: 20_000 }, 19_999), true);
  assert.equal(isPresenceCurrent({ expiresAt: 20_000 }, 20_000), false);
  assert.equal(isActivityCurrent({ expiresAt: { toMillis: () => 12_000 } }, 11_999), true);
  assert.equal(isActivityCurrent({ expiresAt: 12_000 }, 12_000), false);
});

test('pending invitations stop appearing at their expiry while terminal invites remain available', () => {
  assert.equal(isInvitationCurrent({ status: 'pending', expiresAt: 50_000 }, 49_999), true);
  assert.equal(isInvitationCurrent({ status: 'pending', expiresAt: 50_000 }, 50_000), false);
  assert.equal(isInvitationCurrent({ status: 'accepted', expiresAt: 1 }, 50_000), true);
});

test('social timer schedules the next count, presence, activity, or invitation deadline', () => {
  const next = nextSocialExpiry({
    summary: { '40000': 3 }, now: 10_000, expanded: true,
    presence: [{ expiresAt: 30_000, activity: { expiresAt: 15_000 } }],
    invitations: [{ status: 'pending', expiresAt: 25_000 }],
  });
  assert.equal(next, 15_000);
  assert.equal(nextSocialExpiry({ summary: { '9000': 1 }, now: 10_000 }), null);
});

test('expiry delay uses the current clock when snapshots refresh an existing deadline', () => {
  assert.equal(socialExpiryDelay(40_000, 39_000), 1_025);
  assert.equal(socialExpiryDelay(40_000, 40_100), 1);
});

test('heartbeat requires the current visible session version and an active tab', () => {
  const base = { isRegistered: true, visible: true, profileVersion: 'v2', activeVersion: 'v2', documentHidden: false };
  assert.equal(shouldHeartbeat(base), true);
  assert.equal(shouldHeartbeat({ ...base, activeVersion: 'v1' }), false);
  assert.equal(shouldHeartbeat({ ...base, documentHidden: true }), false);
  assert.equal(shouldHeartbeat({ ...base, visible: false }), false);
  assert.equal(shouldHeartbeat({ ...base, isRegistered: false }), false);
});
