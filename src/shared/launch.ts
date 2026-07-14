import type { Session } from './types';

/** A just-launched agent whose session transcript may not exist yet. */
export interface PendingLaunch {
  agent: string;
  /** Resolved launch cwd (matches the session's recorded cwd once it appears). */
  cwd: string;
  /** tmux session name, for display. */
  session: string;
  /** Launch time (ms). Used to ignore pre-existing sessions in the same cwd. */
  since: number;
}

/** Small tolerance (ms) for clock differences between file mtime and Date.now(). */
const SKEW_MS = 5000;

/**
 * Find the session that a just-launched agent produced: same agent + cwd, and
 * updated at/after the launch (so an older session in the same folder — e.g. a
 * non-worktree launch in a dir with history — is not mistaken for the new one).
 * Returns the composite session id, or null if it hasn't appeared yet.
 */
export function findLaunchedSession(sessions: Session[], pending: PendingLaunch): string | null {
  const match = sessions.find(
    (s) =>
      s.agent === pending.agent &&
      s.cwd === pending.cwd &&
      Date.parse(s.updatedAt) >= pending.since - SKEW_MS,
  );
  return match ? match.id : null;
}
