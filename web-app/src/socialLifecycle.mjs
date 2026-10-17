export function socialTimestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

export function isPresenceCurrent(presence, now) {
  return socialTimestampMillis(presence?.expiresAt) > now;
}

export function isActivityCurrent(activity, now) {
  return socialTimestampMillis(activity?.expiresAt) > now;
}

export function isInvitationCurrent(invitation, now) {
  return invitation?.status !== 'pending' || socialTimestampMillis(invitation.expiresAt) > now;
}

export function socialExpiryDelay(nextExpiry, now) {
  return Math.max(1, nextExpiry - now + 25);
}

export function shouldHeartbeat({ isRegistered, visible, profileVersion, activeVersion, documentHidden }) {
  return Boolean(isRegistered && visible && profileVersion && profileVersion === activeVersion && !documentHidden);
}

export function nextSocialExpiry({ summary = {}, presence = [], invitations = [], expanded = false, now = Date.now() }) {
  const expiries = [
    ...Object.keys(summary).map(value => Number(value)),
    ...invitations.filter(invitation => invitation.status === 'pending').map(invitation => socialTimestampMillis(invitation.expiresAt)),
    ...(expanded ? presence.flatMap(person => [socialTimestampMillis(person.expiresAt), socialTimestampMillis(person.activity?.expiresAt)]) : []),
  ].filter(value => Number.isFinite(value) && value > now);
  return expiries.length ? Math.min(...expiries) : null;
}
