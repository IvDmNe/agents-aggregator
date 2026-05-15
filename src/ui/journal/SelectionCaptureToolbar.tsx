import { useEffect, useState } from 'react';
import type { Entry } from '../../shared/types';
import { monoFont, themes, type ThemeMode } from '../theme';
import { kindColor, kindGlyph } from './kind';
import type { JournalKind } from './types';

interface Anchor {
  /** Viewport coords for the toolbar's *bottom-center* (so we render above the selection). */
  top: number;
  left: number;
  entry: Entry;
  text: string;
}

interface SelectionCaptureToolbarProps {
  theme: ThemeMode;
  /** All entries currently rendered in the chat — used to map host `data-entry-id` → Entry. */
  entries: Entry[];
  onCapture: (entry: Entry, kind: JournalKind, text: string) => void;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_OFFSET = 6;

export function SelectionCaptureToolbar({ theme, entries, onCapture }: SelectionCaptureToolbarProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    const recompute = () => {
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setAnchor(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) { setAnchor(null); return; }

      const range = sel.getRangeAt(0);
      const startNode = range.startContainer;
      const startEl = startNode.nodeType === 1
        ? (startNode as Element)
        : startNode.parentElement;
      const host = startEl?.closest('.journal-entry-host[data-entry-id]') as HTMLElement | null;
      if (!host) { setAnchor(null); return; }

      const entryId = host.dataset.entryId;
      const entry = entryId ? entries.find((x) => x.id === entryId) : undefined;
      if (!entry) { setAnchor(null); return; }

      const rect = range.getBoundingClientRect();
      // If the selection has zero size (rare — e.g. across non-rendered nodes) bail.
      if (rect.width === 0 && rect.height === 0) { setAnchor(null); return; }

      setAnchor({
        top: Math.max(8, rect.top - TOOLBAR_OFFSET),
        left: rect.left + rect.width / 2,
        entry,
        text,
      });
    };

    document.addEventListener('selectionchange', recompute);
    // Selection can also shift on scroll/resize while a selection is active.
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      document.removeEventListener('selectionchange', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [entries]);

  if (!anchor) return null;

  const t = themes[theme];

  const capture = (kind: JournalKind) => {
    onCapture(anchor.entry, kind, anchor.text);
    setAnchor(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div
      // Render at viewport coords, anchored *above* the selection's top edge.
      style={{
        position: 'fixed', zIndex: 90,
        top: anchor.top - TOOLBAR_HEIGHT, left: anchor.left,
        transform: 'translateX(-50%)',
        display: 'inline-flex', gap: 4,
        padding: 4,
        background: t.panel, border: `1px solid ${t.border}`,
        borderRadius: 6,
        boxShadow: theme === 'dark'
          ? '0 6px 18px rgba(0,0,0,0.45)'
          : '0 6px 18px rgba(30,25,18,0.12)',
      }}
      // Don't let mousedown on the toolbar collapse the selection — we still
      // need it intact when the click handler fires.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarBtn theme={theme} kind="learning" label="Learning" onClick={() => capture('learning')} />
      <ToolbarBtn theme={theme} kind="next"     label="Next"     onClick={() => capture('next')} />
      <ToolbarBtn theme={theme} kind="note"     label="Note"     onClick={() => capture('note')} />
    </div>
  );
}

interface ToolbarBtnProps {
  theme: ThemeMode;
  kind: JournalKind;
  label: string;
  onClick: () => void;
}
function ToolbarBtn({ theme, kind, label, onClick }: ToolbarBtnProps) {
  const t = themes[theme];
  const color = kindColor(theme, kind);
  return (
    <button
      type="button"
      title={`Save selection as ${label.toLowerCase()}`}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 8px',
        borderRadius: 4,
        background: 'transparent',
        border: `1px solid ${t.border}`,
        color: t.fg2, fontFamily: monoFont, fontSize: 11,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = t.panel2;
        e.currentTarget.style.color = color;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = t.fg2;
        e.currentTarget.style.borderColor = t.border;
      }}
    >
      <span style={{ color, fontSize: 11 }}>{kindGlyph(kind)}</span>
      <span>{label}</span>
    </button>
  );
}
