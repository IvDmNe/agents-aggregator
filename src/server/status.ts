import type { BoardColumn, LastKind } from '../shared/types';

/** Session is "running" if it wrote within this many seconds. */
export const RUNNING_SEC = 10;
/** Beyond this age, a session is "done" unless its process is still alive. */
export const STALL_MAX_SEC = 900;

export interface ColumnInput {
  /** Seconds since the session file was last updated. */
  ageSec: number;
  /** Shape of the last meaningful entry. */
  lastKind: LastKind;
  /** True if an agent process for this session is alive in a tmux pane. */
  paneAlive: boolean;
}

/**
 * Classify a session into a board column. Pure; first match wins.
 *
 * Rationale for needs-approval: an unanswered tool call on a still-alive (or
 * only-recently-stalled) process is most likely blocked on a permission prompt.
 */
export function deriveColumn(i: ColumnInput): BoardColumn {
  if (i.ageSec < RUNNING_SEC) return 'running';
  const within = i.ageSec < STALL_MAX_SEC;
  const active = i.paneAlive || within;
  if (i.lastKind === 'tool_pending' && active) return 'needs-approval';
  if (i.lastKind === 'turn_done' && active) return 'needs-input';
  return 'done';
}
