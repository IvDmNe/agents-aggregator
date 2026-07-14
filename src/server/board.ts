import { deriveColumn } from './status';
import type { BoardEntry, LastKind, Session } from '../shared/types';

export function parseWindowH(raw: string | null): number {
  if (raw === null) return 6;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 6;
}

/**
 * Filter to recent+live sessions and classify each into a board column.
 * Pure: the caller supplies `isAlive`/`isAwaitingApproval` (tmux signals) and
 * `nowMs`, so this is fully testable without touching tmux or the clock.
 */
export function buildBoard(
  sessions: Session[],
  isAlive: (agent: string, cwd: string) => boolean,
  isAwaitingApproval: (agent: string, cwd: string) => boolean,
  nowMs: number,
  windowH: number,
): BoardEntry[] {
  const windowMs = windowH * 3600 * 1000;
  const out: BoardEntry[] = [];
  for (const s of sessions) {
    const ageMs = nowMs - Date.parse(s.updatedAt);
    if (!s.live && !(ageMs < windowMs)) continue;
    const paneAlive = !!s.cwd && isAlive(s.agent, s.cwd);
    const awaitingApproval = !!s.cwd && isAwaitingApproval(s.agent, s.cwd);
    const column = deriveColumn({
      ageSec: ageMs / 1000,
      lastKind: (s.lastKind ?? 'unknown') as LastKind,
      paneAlive,
      awaitingApproval,
    });
    out.push({ session: s, column, lastLine: s.lastLine ?? '', live: s.live });
  }
  return out;
}
