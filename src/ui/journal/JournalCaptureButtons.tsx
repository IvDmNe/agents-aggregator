import { monoFont, themes, type ThemeMode } from '../theme';
import { kindColor, kindGlyph } from './kind';
import type { JournalKind } from './types';

interface JournalCaptureButtonsProps {
  theme: ThemeMode;
  onCapture: (kind: JournalKind) => void;
  compact?: boolean;
}

export function JournalCaptureButtons({ theme, onCapture, compact }: JournalCaptureButtonsProps) {
  const t = themes[theme];
  const btn = (kind: JournalKind, label: string) => (
    <button
      key={kind}
      title={`Save as ${label.toLowerCase()}`}
      onClick={(e) => { e.stopPropagation(); onCapture(kind); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 3,
        background: 'transparent',
        border: `1px solid ${t.border}`,
        color: t.dim, fontFamily: monoFont, fontSize: 10.5,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = t.panel2;
        e.currentTarget.style.color = kindColor(theme, kind);
        e.currentTarget.style.borderColor = kindColor(theme, kind);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = t.dim;
        e.currentTarget.style.borderColor = t.border;
      }}
    >
      <span style={{ fontSize: 10 }}>{kindGlyph(kind)}</span>
      <span>{label}</span>
    </button>
  );

  // No inline `opacity` — the host-hover rule in AppShell controls it.
  // Inline `opacity` would beat the CSS `:hover` rule on specificity and keep
  // the row permanently hidden.
  return (
    <span className="journal-capture-row" style={{
      display: 'inline-flex', gap: 4,
      transition: 'opacity .14s',
    }}>
      {btn('learning', 'Learning')}
      {btn('next', 'Next')}
      {btn('note', 'Note')}
    </span>
  );
}
