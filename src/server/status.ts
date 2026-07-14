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
  /**
   * True only when the agent's tmux pane is *confirmed* showing a permission
   * prompt (via capture-pane). This is the one signal that distinguishes a
   * genuine "needs approval" from an agent that is simply running a long tool
   * call — both look like an unanswered tool_use in the JSONL. Defaults to
   * false when there is no pane to inspect (e.g. agent not under tmux).
   */
  awaitingApproval?: boolean;
}

/**
 * Classify a session into a board column. Pure; first match wins.
 *
 * needs-approval is only reported when a pane capture confirms a prompt is on
 * screen — an unanswered tool_use alone means the agent is *executing* a tool
 * (Running), not blocked. Without a pane to inspect we cannot tell the two
 * apart, so we err toward Running rather than nagging the user for approval.
 */
export function deriveColumn(i: ColumnInput): BoardColumn {
  if (i.ageSec < RUNNING_SEC) return 'running';
  const within = i.ageSec < STALL_MAX_SEC;
  const active = i.paneAlive || within;
  if (i.lastKind === 'tool_pending') {
    if (i.awaitingApproval) return 'needs-approval';
    // Unanswered tool call with no confirmed prompt = a tool is executing.
    return active ? 'running' : 'done';
  }
  if (i.lastKind === 'turn_done' && active) return 'needs-input';
  return 'done';
}
