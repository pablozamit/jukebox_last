// A denied Firestore transaction has not committed. Retry only the known race
// where another client created the song after this attempt read it as absent.
export async function withProposalRaceRetry(runAttempt, songExistsOnServer) {
  let readMissingSong = false;
  let attemptedProposal = false;
  const recordSongRead = exists => {
    readMissingSong = !exists;
    attemptedProposal ||= !exists;
    return attemptedProposal && exists;
  };
  try {
    return await runAttempt(recordSongRead);
  } catch (error) {
    if (error.code !== 'permission-denied' || !readMissingSong) throw error;
    if (!await songExistsOnServer()) throw error;
    return runAttempt(recordSongRead);
  }
}
