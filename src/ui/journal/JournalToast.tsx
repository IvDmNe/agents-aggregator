import { monoFont, themes, type ThemeMode } from '../theme';
import { kindColor, kindGlyph, kindLabel } from './kind';
import { projectLabel, type JournalKind } from './types';

export interface ToastState {
  kind: JournalKind;
  projectKey: string;
  /** Optional jump-to-journal action. */
  onView?: () => void;
  /** Always available — un-does the capture. */
  onUndo: () => void;
}

interface JournalToastProps {
  theme: ThemeMode;
  toast: ToastState | null;
  onDismiss: () => void;
}

export function JournalToast({ theme, toast, onDismiss }: JournalToastProps) {
  const t = themes[theme];
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px 8px 14px',
      background: t.panel, border: `1px solid ${t.border}`,
      borderLeft: `2px solid ${kindColor(theme, toast.kind)}`,
      borderRadius: 6, fontSize: 12, color: t.fg,
      boxShadow: theme === 'dark'
        ? '0 8px 24px rgba(0,0,0,0.5)'
        : '0 8px 24px rgba(30,25,18,0.10)',
    }}>
      <span style={{ color: kindColor(theme, toast.kind), fontSize: 12 }}>
        {kindGlyph(toast.kind)}
      </span>
      <span>
        Saved as {kindLabel(toast.kind).toLowerCase()} ·{' '}
        <span style={{ color: t.dim, fontFamily: monoFont, fontSize: 11 }}>
          {projectLabel(toast.projectKey)}
        </span>
      </span>
      {toast.onView && (
        <button onClick={toast.onView} style={{
          background: 'transparent', border: 'none', color: t.fg2,
          fontSize: 11, fontFamily: monoFont, cursor: 'pointer', padding: '2px 4px',
        }}>view →</button>
      )}
      <button onClick={toast.onUndo} style={{
        background: 'transparent', border: 'none', color: t.accent,
        fontSize: 11, fontFamily: monoFont, cursor: 'pointer', padding: '2px 4px',
      }}>undo</button>
      <button onClick={onDismiss} style={{
        background: 'transparent', border: 'none', color: t.dim2,
        cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1,
      }}>×</button>
    </div>
  );
}
