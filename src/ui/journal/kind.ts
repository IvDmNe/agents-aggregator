import { themes, type ThemeMode } from '../theme';
import type { JournalKind } from './types';

export function kindLabel(k: JournalKind): string {
  return k === 'learning' ? 'Learning' : k === 'next' ? 'Next' : 'Note';
}

export function kindGlyph(k: JournalKind): string {
  return k === 'learning' ? '◆' : k === 'next' ? '☐' : '✎';
}

export function kindColor(theme: ThemeMode, k: JournalKind): string {
  const t = themes[theme];
  if (k === 'learning') return t.amber;
  if (k === 'next') return t.accent;
  return t.green;
}

export function fmtRelative(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const min = 60 * 1000;
  if (diff < min) return 'just now';
  if (diff < 60 * min) return `${Math.floor(diff / min)}m ago`;
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))}h ago`;
  const days = Math.floor(diff / (24 * 60 * min));
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
