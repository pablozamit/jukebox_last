import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeUserProfile, registerUserProfile } from '../src/userProfile.mjs';

const profile = { isRegistered: true, email: 'dj@example.test', djName: 'DJ Test' };

function profileTransaction(existing) {
  let value = existing ? structuredClone(existing) : undefined;
  const writes = [];
  return {
    async get() { return { exists: () => value !== undefined }; },
    set(ref, data) { writes.push({ kind: 'set', data }); value = structuredClone(data); },
    update(ref, data) { writes.push({ kind: 'update', data }); value = { ...value, ...structuredClone(data) }; },
    get value() { return value; },
    writes,
  };
}

test('registration preserves current tokens and bridge fields rather than stale UI state', async () => {
  const current = { proposals: ['current-proposal'], votes: ['new-vote'], points: 75, favorites: ['favorite'] };
  const transaction = profileTransaction(current);
  await registerUserProfile(transaction, 'user', profile);
  assert.deepEqual(transaction.value, { ...current, ...profile });
  assert.deepEqual(transaction.writes, [{ kind: 'update', data: profile }]);
});

test('initialization after registration cannot erase the completed profile', async () => {
  const transaction = profileTransaction();
  await registerUserProfile(transaction, 'user', profile);
  await initializeUserProfile(transaction, 'user');
  assert.deepEqual(transaction.value, { proposals: [], votes: [], ...profile });
  assert.equal(transaction.writes.length, 1);
});

test('registration after initialization completes the same empty profile', async () => {
  const transaction = profileTransaction();
  await initializeUserProfile(transaction, 'user');
  await registerUserProfile(transaction, 'user', profile);
  assert.deepEqual(transaction.value, { proposals: [], votes: [], ...profile });
  assert.equal(transaction.writes[1].kind, 'update');
});
