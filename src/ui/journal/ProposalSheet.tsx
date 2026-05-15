import { useState } from 'react';
import { Markdown } from '../components/Markdown';
import { monoFont, themes, type ThemeMode } from '../theme';
import { kindColor, kindGlyph, kindLabel } from './kind';
import { projectLabel, type JournalProposal } from './types';

interface ProposalSheetProps {
  theme: ThemeMode;
  proposals: JournalProposal[];
  projectKey: string;
  onAccept: (p: JournalProposal) => void;
  onAcceptAll: (ps: JournalProposal[]) => void;
  onDismiss: () => void;
}

export function ProposalSheet({
  theme, proposals, projectKey, onAccept, onAcceptAll, onDismiss,
}: ProposalSheetProps) {
  const t = themes[theme];
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(proposals.map((_, i) => i)),
  );

  const toggle = (i: number) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <div style={{
      margin: '8px 0 12px',
      border: `1px solid ${t.amber}55`,
      borderRadius: 6, background: t.panel,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', background: t.panel2,
        borderBottom: `1px solid ${t.border}`,
        fontFamily: monoFont, fontSize: 11, color: t.dim,
      }}>
        <span style={{ color: t.amber }}>◆</span>
        <span style={{ color: t.fg, fontWeight: 600 }}>
          {proposals.length} journal {proposals.length === 1 ? 'entry' : 'entries'} proposed
        </span>
        <span style={{ color: t.dim2 }}>for {projectLabel(projectKey)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={() => onAcceptAll([...selected].map((i) => proposals[i]))}
            disabled={selected.size === 0}
            style={{
              background: selected.size === 0 ? t.panel2 : t.accent,
              border: 'none', color: selected.size === 0 ? t.dim2 : '#fff',
              padding: '4px 9px', borderRadius: 4,
              fontFamily: monoFont, fontSize: 11,
              cursor: selected.size === 0 ? 'default' : 'pointer',
            }}>Add {selected.size} →</button>
          <button onClick={onDismiss} style={{
            background: 'transparent', border: `1px solid ${t.border}`,
            color: t.dim, padding: '4px 8px', borderRadius: 4,
            fontFamily: monoFont, fontSize: 11, cursor: 'pointer',
          }}>dismiss</button>
        </span>
      </div>
      <div>
        {proposals.map((p, i) => (
          <div key={i} onClick={() => toggle(i)} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '9px 12px',
            borderBottom: i === proposals.length - 1 ? 'none' : `1px solid ${t.border2}`,
            background: selected.has(i)
              ? 'transparent'
              : (theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
            opacity: selected.has(i) ? 1 : 0.5,
            cursor: 'pointer',
          }}>
            <span style={{
              width: 14, height: 14, marginTop: 2, borderRadius: 3,
              border: `1px solid ${selected.has(i) ? kindColor(theme, p.kind) : t.border}`,
              background: selected.has(i) ? kindColor(theme, p.kind) : 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 10, flexShrink: 0,
            }}>{selected.has(i) ? '✓' : ''}</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '1px 6px', borderRadius: 3,
              border: `1px solid ${kindColor(theme, p.kind)}55`,
              color: kindColor(theme, p.kind),
              fontFamily: monoFont, fontSize: 10,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {kindGlyph(p.kind)} {kindLabel(p.kind)}
            </span>
            <span style={{ flex: 1, color: t.fg, fontSize: 12.5, lineHeight: 1.5 }}>
              <Markdown theme={theme} content={p.text} compact />
              {p.tags.length > 0 && (
                <span style={{ marginLeft: 8, color: t.dim2, fontFamily: monoFont, fontSize: 11 }}>
                  {p.tags.map((tag) => `#${tag}`).join(' ')}
                </span>
              )}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onAccept(p); }} style={{
              background: 'transparent', border: `1px solid ${t.border}`,
              color: t.dim, padding: '3px 7px', borderRadius: 4,
              fontFamily: monoFont, fontSize: 10.5, cursor: 'pointer',
              flexShrink: 0,
            }}>add</button>
          </div>
        ))}
      </div>
    </div>
  );
}
