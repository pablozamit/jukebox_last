export function firebaseRuntime(env = {}, hostname = 'localhost') {
  const useEmulators = env.VITE_USE_EMULATORS === 'true';
  const projectId = useEmulators ? (env.VITE_FIREBASE_PROJECT_ID || 'demo-catrina-social') : 'jukebox-catrinero';
  if (useEmulators && (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname) || projectId !== 'demo-catrina-social')) {
    throw new Error('Emulator mode requires localhost and project demo-catrina-social. No production fallback is allowed.');
  }
  const region = env.VITE_SOCIAL_FUNCTIONS_REGION || (useEmulators ? 'europe-west1' : null);
  if (region && !/^[a-z]+-[a-z]+\d+$/.test(region)) throw new Error('Invalid Functions region.');
  return {
    useEmulators, projectId, region,
    socialEnabled: env.VITE_SOCIAL_MAP_ENABLED === 'true' && Boolean(region),
    authPort: 9099, firestorePort: 8080, functionsPort: 5001,
  };
}
