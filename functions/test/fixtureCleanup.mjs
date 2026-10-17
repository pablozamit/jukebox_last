import { createHash } from 'node:crypto';

// Call only with UIDs minted by the current test run. Never scans or clears
// the project globally, so a shared emulator can host another QA session.
export async function cleanupFixtureUsers(db, uids, adminAuth = null) {
  const identities = new Set(uids);
  const invitations = new Map();
  for (const uid of uids) {
    for (const field of ['senderId', 'recipientId']) {
      const found = await db.collection('socialInvitations').where(field, '==', uid).get();
      found.docs.forEach(doc => invitations.set(doc.id, doc.ref));
    }
  }
  for (const ref of invitations.values()) await ref.delete();
  for (let i = 0; i < uids.length; i++) for (let j = i + 1; j < uids.length; j++) {
    const pairId = createHash('sha256').update(JSON.stringify([uids[i], uids[j]].sort())).digest('hex');
    await db.doc(`socialPairs/${pairId}`).delete();
  }
  for (const uid of uids) {
    const room = db.doc('rooms/catrina'), presence = db.doc(`rooms/catrina/presence/${uid}`);
    await db.runTransaction(async tx => {
      const [roomS, presenceS] = await Promise.all([tx.get(room), tx.get(presence)]);
      if (!presenceS.exists) return;
      const current = presenceS.data();
      const buckets = { ...(roomS.data()?.buckets || {}) };
      const key = String(current.expiresAt);
      if (buckets[key]) {
        buckets[key] = Math.max(0, (buckets[key] || 0) - 1);
        if (!buckets[key]) delete buckets[key];
      }
      if (roomS.exists) tx.update(room, { buckets, updatedAt: Date.now() });
      else tx.set(room, { buckets, updatedAt: Date.now() });
      tx.delete(presence);
    });
    const receipts = await db.collection('socialEventReceipts').where('uid', '==', uid).get();
    for (const receipt of receipts.docs) await receipt.ref.delete();
    await db.recursiveDelete(db.doc(`socialUsers/${uid}`));
    await db.doc(`socialStats/${uid}`).delete();
    await db.doc(`users/${uid}`).delete();
    if (adminAuth && identities.has(uid)) {
      try { await adminAuth.deleteUser(uid); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    }
  }
}

export async function restoreDocument(ref, snapshot) {
  if (snapshot?.exists) await ref.set(snapshot.data());
  else await ref.delete();
}
