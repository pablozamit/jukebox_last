import { timestampMillis } from './appLogic.js';

// Eligibility is separate from the open dialog: a confirmed answer must not
// unmount its result before the user has seen it.
export function triviaPresentation({ userId, isRegistered, showModal, now, answeredAt, lastTriviaAt, windowMs }) {
  if (!userId || !isRegistered) return { showGift: false, showDialog: false, answered: false };
  const lastAnswer = Math.max(timestampMillis(answeredAt), timestampMillis(lastTriviaAt));
  const answered = lastAnswer > 0 && now - lastAnswer < windowMs;
  return { showGift: !showModal && !answered, showDialog: showModal, answered };
}
