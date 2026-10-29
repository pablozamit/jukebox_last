// The transaction retries if initialization, registration or the bridge changes
// this profile concurrently. Existing vote/proposal tokens always stay intact.
export async function initializeUserProfile(transaction, userRef) {
  const snapshot = await transaction.get(userRef);
  if (!snapshot.exists()) transaction.set(userRef, { proposals: [], votes: [] });
}

export async function registerUserProfile(transaction, userRef, profile) {
  const snapshot = await transaction.get(userRef);
  if (snapshot.exists()) {
    transaction.update(userRef, profile);
  } else {
    transaction.set(userRef, { proposals: [], votes: [], ...profile });
  }
}
