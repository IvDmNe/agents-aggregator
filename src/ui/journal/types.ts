import type { AgentType, JournalItem, JournalKind } from '../../shared/types';

export type { JournalItem, JournalKind };

/** Shape accepted by `add` / `addMany`. Auto-fills `id`, `createdAt`,
 *  `done`, `tags`. */
export type NewJournalItem = Omit<JournalItem, 'id' | 'createdAt' | 'done' | 'tags'> & {
  tags?: string[];
  done?: boolean;
};

/** Proposal returned by the summarize endpoint — minus the auto-filled fields.
 *  Carries `sourceEntryId: null` so accepting it can flow straight into
 *  `journal.add` without further fixups. */
export interface JournalProposal {
  kind: JournalKind;
  text: string;
  tags: string[];
  agent: AgentType | null;
  sourceSessionId: string | null;
  sourceEntryId: null;
  projectKey: string;
}

export function projectKeyFor(cwd: string): string {
  // Identity for now. Swap to canonical project id once the backend exposes one.
  return cwd;
}

export function projectLabel(cwd: string): string {
  if (!cwd) return 'Unknown';
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1] || cwd;
}
