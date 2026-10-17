import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseRuntime } from '../src/firebaseRuntime.mjs';

test('local emulator mode cannot use a real project or remote origin', () => {
  const env = { VITE_USE_EMULATORS: 'true', VITE_SOCIAL_MAP_ENABLED: 'true' };
  assert.equal(firebaseRuntime(env, 'localhost').projectId, 'demo-catrina-social');
  assert.equal(firebaseRuntime(env, '127.0.0.1').socialEnabled, true);
  assert.throws(() => firebaseRuntime({ ...env, VITE_FIREBASE_PROJECT_ID: 'jukebox-catrinero' }), /No production fallback/);
  assert.throws(() => firebaseRuntime(env, 'example.com'), /No production fallback/);
});

test('production social feature needs explicit flag and region; music stays available', () => {
  assert.equal(firebaseRuntime({}, 'example.com').socialEnabled, false);
  assert.equal(firebaseRuntime({ VITE_SOCIAL_MAP_ENABLED: 'true' }, 'example.com').socialEnabled, false);
  assert.equal(firebaseRuntime({ VITE_SOCIAL_MAP_ENABLED: 'true', VITE_SOCIAL_FUNCTIONS_REGION: 'europe-west1' }, 'example.com').socialEnabled, true);
  assert.equal(firebaseRuntime({}, 'example.com').projectId, 'jukebox-catrinero');
});
