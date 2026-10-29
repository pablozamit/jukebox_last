import { randomUUID } from 'node:crypto';
import { CATALOG_BY_ID, STARTER_IDS, DEFAULT_EQUIPPED, ACHIEVEMENT_IDS, SOCIAL_ZONES, INVITATION_TYPES, INVITATION_TTL_MS } from './generated/socialCatalog.mjs';

export const ROOM = 'catrina';
export const PRESENCE_LEASE_MS = 120_000;
export const ACTIVITY_MS = 10_000;
export const SEND_COOLDOWN_MS = 30_000;
export const MAX_OUTGOING = 5;
export const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
export const assert = (ok, code = 'invalid-argument', message = 'Invalid request') => { if (!ok) fail(code, message); };
export const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
export const requestId = (v) => id(v) && v.length >= 8;
export const leaseEnd = (now) => (Math.floor(now / 60_000) + 1) * 60_000 + PRESENCE_LEASE_MS;
export const active = (p, now) => !!(p?.visible && Number.isFinite(p.expiresAt) && p.expiresAt > now);
export function bucketsOf(room, now) {
  const result = {};
  for (const [expiry, count] of Object.entries(room?.buckets || {})) {
    if (Number(expiry) > now && Number.isInteger(count) && count > 0) result[expiry] = count;
  }
  return result;
}
export function moveBucket(room, oldPresence, newPresence, now) {
  const b = bucketsOf(room, now);
  if (active(oldPresence, now)) {
    const key = String(oldPresence.expiresAt);
    b[key] = Math.max(0, (b[key] || 0) - 1);
    if (!b[key]) delete b[key];
  }
  if (active(newPresence, now)) {
    const key = String(newPresence.expiresAt);
    b[key] = (b[key] || 0) + 1;
  }
  return b;
}
export function sameBuckets(a = {}, b = {}) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
export function publicName(user) {
  const name = typeof user?.djName === 'string' ? user.djName.trim() : '';
  return name.slice(0, 40) || 'DJ';
}
export function level(total) {
  const earned = Math.max(0, Number(total) || 0);
  return earned >= 5000 ? 5 : earned >= 2000 ? 4 : earned >= 500 ? 3 : earned >= 100 ? 2 : 1;
}
export function allowedLegacy(achievements) {
  return Array.isArray(achievements) ? [...new Set(achievements.filter(v => ACHIEVEMENT_IDS.includes(v)))] : [];
}
export function unknownLegacy(achievements) {
  if (achievements == null) return [];
  if (!Array.isArray(achievements)) return ['malformed'];
  return [...new Set(achievements.filter(v => !ACHIEVEMENT_IDS.includes(v)).map(v => typeof v === 'string' && v.length <= 128 ? v : 'malformed'))];
}
export function initialSocial(now) {
  return { equipped: { ...DEFAULT_EQUIPPED }, visible: false, zone: null, version: randomUUID(), favoriteSong: null, muteInvites: false, joinedAt: now };
}
export function refs(db, uid) {
  return {
    user: db.doc(`users/${uid}`), social: db.doc(`socialUsers/${uid}`), stats: db.doc(`socialStats/${uid}`),
    presence: db.doc(`rooms/${ROOM}/presence/${uid}`), room: db.doc(`rooms/${ROOM}`),
    inventory: (itemId) => db.doc(`socialUsers/${uid}/inventory/${itemId}`),
    block: (otherUid) => db.doc(`socialUsers/${uid}/blocks/${otherUid}`),
    operation: (opId) => db.doc(`socialUsers/${uid}/operations/${opId}`),
  };
}
export function requireAuth(auth, registered = true) {
  assert(auth?.uid && id(auth.uid), 'unauthenticated', 'Sign in required');
  if (registered) assert(auth.token?.firebase?.sign_in_provider !== 'anonymous' && !!auth.token?.email, 'permission-denied', 'Registered account required');
  return auth.uid;
}
export function validateActionInput(action, payload) {
  assert(typeof action === 'string', 'invalid-argument', 'Action required');
  const fields = {
    initialize: [], show: ['zone'], heartbeat: ['version'], hide: [], favorite: ['songId'], card: ['uid'],
    invite: ['recipientId', 'type', 'requestId'], respond: ['id', 'response'], cancel: ['id'],
    preferences: ['muteInvites'], block: ['uid'], unblock: ['uid'], buy: ['itemId', 'requestId'], equip: ['itemId'],
  };
  assert(Object.hasOwn(fields, action), 'invalid-argument', 'Unknown action');
  assert(Object.keys(payload).every(k => fields[action].includes(k)), 'invalid-argument', 'Unexpected field');
  return fields[action];
}
export function assertZone(zone) { assert(SOCIAL_ZONES.some(z => z.id === zone), 'invalid-argument', 'Unknown zone'); }
export function assertType(type) { assert(INVITATION_TYPES.includes(type), 'invalid-argument', 'Unknown invitation type'); }
export function assertCatalogItem(itemId) { assert(id(itemId) && CATALOG_BY_ID[itemId]?.active, 'invalid-argument', 'Unknown item'); return CATALOG_BY_ID[itemId]; }
export { CATALOG_BY_ID, STARTER_IDS, INVITATION_TTL_MS };
