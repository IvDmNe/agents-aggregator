import { useState } from 'react';
import type { Session } from '../../shared/types';
import { Markdown } from '../components/Markdown';
import { AGENT_HUES, monoFont, sansFont, themes, type Theme, type ThemeMode } from '../theme';
import { fmtRelative, kindColor, kindGlyph } from './kind';
import type { JournalItem } from './types';

interface JournalItemRowProps {
  theme: ThemeMode;
  item: JournalItem;
  sessions: Session[];
  onToggleDone: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<JournalItem>) => void;
  onJumpToSession: (id: string) => void;
}

export function JournalItemRow({
  theme, item, sessions, onToggleDone, onRemove, onUpdate, onJumpToSession,
}: JournalItemRowProps) {
  const t = themes[theme];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const session = sessions.find((s) => s.id === item.sourceSessionId);
  const isNext = item.kind === 'next';
  const color = kindColor(theme, item.kind);

  const save = () => {
    const v = draft.trim();
    if (v && v !== item.text) onUpdate(item.id, { text: v });
    setEditing(false);
  };

  return (
    <div className="journal-item-row" style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '10px 14px',
      borderBottom: `1px solid ${t.border2}`,
      position: 'relative',
    }}>
      {isNext ? (
        <button onClick={() => onToggleDone(item.id)} style={{
          width: 16, height: 16, marginTop: 2, borderRadius: 3,
          border: `1.5px solid ${item.done ? color : t.border}`,
          background: item.done ? color : 'transparent',
          color: '#fff', fontSize: 10, lineHeight: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, padding: 0,
        }}>{item.done ? '✓' : ''}</button>
      ) : (
        <span style={{
          width: 16, height: 16, marginTop: 2, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: 12,
        }}>{kindGlyph(item.kind)}</span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              if (e.key === 'Escape') { setDraft(item.text); setEditing(false); }
            }}
            style={{
              width: '100%', minHeight: 50, resize: 'vertical',
              background: t.panel2, border: `1px solid ${t.accent}55`,
              borderRadius: 4, color: t.fg, fontFamily: sansFont, fontSize: 13,
              padding: 8, outline: 'none', boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            onClick={() => setEditing(true)}
            style={{
              fontSize: 13, lineHeight: 1.55, color: item.done ? t.dim2 : t.fg,
              textDecoration: item.done ? 'line-through' : 'none',
              cursor: 'text',
            }}>
            <Markdown theme={theme} content={item.text} compact />
          </div>
        )}

        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          fontFamily: monoFont, fontSize: 10.5, color: t.dim2, marginTop: 5,
          flexWrap: 'wrap',
        }}>
          {item.agent && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              color: AGENT_HUES[theme][item.agent].fg,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: AGENT_HUES[theme][item.agent].fg,
              }} />
              {item.agent}
            </span>
          )}
          {session && (
            <button onClick={() => onJumpToSession(session.id)} style={{
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              color: t.dim, fontFamily: monoFont, fontSize: 10.5,
            }}>
              ↗ {session.name ? session.name.slice(0, 40) : 'untitled'}
            </button>
          )}
          <span>{fmtRelative(item.createdAt)}</span>
          {item.tags.map((tag) => (
            <span key={tag} style={{ color: t.dim }}>#{tag}</span>
          ))}
        </div>
      </div>

      <div className="journal-item-tools" style={{
        display: 'flex', gap: 4, opacity: 0, transition: 'opacity .14s',
      }}>
        <button onClick={() => setEditing(true)} title="Edit" style={iconBtnStyle(t)}>✎</button>
        <button onClick={() => onRemove(item.id)} title="Remove" style={iconBtnStyle(t)}>×</button>
      </div>
    </div>
  );
}

function iconBtnStyle(t: Theme) {
  return {
    width: 22, height: 22, padding: 0, lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 4, border: 'none', background: 'transparent',
    color: t.dim2, fontFamily: monoFont, fontSize: 12, cursor: 'pointer',
  } as const;
}
