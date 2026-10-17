import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { executeAction } from './actions.mjs';
import { eventValid, processEvent, reconcilePresence, expireInvitations } from './events.mjs';

initializeApp();
const db = getFirestore();
const region = process.env.SOCIAL_FUNCTION_REGION || 'europe-west1';
const errorCodes = new Set(['invalid-argument', 'unauthenticated', 'permission-denied', 'failed-precondition', 'not-found', 'already-exists', 'resource-exhausted']);

export const socialAction = onCall({ region, cors: true, maxInstances: 20 }, async request => {
  try { return await executeAction(db, request.auth, request.data); }
  catch (error) {
    if (errorCodes.has(error.code)) throw new HttpsError(error.code, error.message);
    logger.error('socialAction failed', { action: request.data?.action, code: error.code || 'internal' });
    throw new HttpsError('internal', 'Social action failed');
  }
});

export const socialEventCreated = onDocumentCreated({ document: 'socialEvents/{eventId}', region, retry: true }, async event => {
  if (!event.data) return;
  const record = event.data.data();
  if (!eventValid(record, event.params.eventId)) {
    logger.error('Invalid social event retained for inspection', { eventId: event.params.eventId });
    return;
  }
  await processEvent(db, event.params.eventId, record);
});

export const socialMaintenance = onSchedule({ schedule: 'every 5 minutes', region, timeZone: 'Europe/Madrid' }, async () => {
  await reconcilePresence(db);
  await expireInvitations(db);
});
