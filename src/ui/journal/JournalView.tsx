import { useMemo, useState } from 'react';
import type { Session } from '../../shared/types';
import { monoFont, sansFont, themes, type ThemeMode } from '../theme';
import { JournalItemRow } from './JournalItemRow';
import { JournalProjectRail } from './JournalProjectRail';
import { kindColor, kindGlyph, kindLabel } from './kind';
import {
  projectKeyFor, projectLabel,
  type JournalKind,
} from './types';
import type { UseJournal } from './useJournal';

type Tab = 'all' | JournalKind;

interface JournalViewProps {
  theme: ThemeMode;
  journal: UseJournal;
  /** Selected project — `null` shows an empty-state until one is picked. */
  projectKey: string | null;
  setProjectKey: (key: string) => void;
  sessions: Session[];
  onJumpToSession: (sessionId: string) => void;
}

export function JournalView({
  theme, journal, projectKey, setProjectKey, sessions, onJumpToSession,
}: JournalViewProps) {
  const t = themes[theme];
  const [tab, setTab] = useState<Tab>('all');
  const [quickText, setQuickText] = useState('');
  const [quickKind, setQuickKind] = useState<JournalKind>('note');

  const itemsForProject = useMemo(
    () => (projectKey ? journal.items.filter((it) => it.projectKey === projectKey) : []),
    [journal.items, projectKey],
  );

  const visible = useMemo(
    () => tab === 'all' ? itemsForProject : itemsForProject.filter((it) => it.kind === tab),
    [itemsForProject, tab],
  );

  const counts = useMemo(() => {
    const c = { learning: 0, next: 0, note: 0, openNext: 0 };
    for (const it of itemsForProject) {
      c[it.kind] += 1;
      if (it.kind === 'next' && !it.done) c.openNext += 1;
    }
    return c;
  }, [itemsForProject]);

  const projectSessions = useMemo(
    () => (projectKey ? sessions.filter((s) => projectKeyFor(s.cwd) === projectKey) : []),
    [sessions, projectKey],
  );

  const submitQuick = (e?: React.FormEvent) => {
    e?.preventDefault?.();
    const v = quickText.trim();
    if (!v || !projectKey) return;
    journal.add({
      kind: quickKind, text: v,
      projectKey, agent: null,
      sourceSessionId: null, sourceEntryId: null,
    });
    setQuickText('');
  };

  return (
    <div style={{
      flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr',
      minHeight: 0,
    }}>
      <JournalProjectRail
        theme={theme} items={journal.items}
        projectKey={projectKey} setProjectKey={setProjectKey}
        sessions={sessions}
      />

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: t.bg }}>
        {!projectKey ? (
          <EmptyProjectState theme={theme} />
        ) : (
          <>
            <div style={{
              padding: '18px 28px 14px',
              borderBottom: `1px solid ${t.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
                <span style={{
                  fontSize: 22, fontWeight: 600, color: t.fg,
                  letterSpacing: '-0.01em',
                }}>{projectLabel(projectKey)}</span>
                <span style={{ fontFamily: monoFont, fontSize: 11, color: t.dim }}>{projectKey}</span>
                <span style={{ marginLeft: 'auto', fontFamily: monoFont, fontSize: 11, color: t.dim2 }}>
                  {projectSessions.length} session{projectSessions.length === 1 ? '' : 's'} · {itemsForProject.length} item{itemsForProject.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                <FilterPill
                  theme={theme} active={tab === 'all'}
                  onClick={() => setTab('all')}
                  glyph="∗" color={t.fg}
                  label="All" count={String(itemsForProject.length)} />
                <FilterPill
                  theme={theme} active={tab === 'learning'}
                  onClick={() => setTab('learning')}
                  glyph="◆" color={t.amber}
                  label="Learnings" count={String(counts.learning)} />
                <FilterPill
                  theme={theme} active={tab === 'next'}
                  onClick={() => setTab('next')}
                  glyph="☐" color={t.accent}
                  label="Next steps" count={`${counts.openNext}/${counts.next}`} />
                <FilterPill
                  theme={theme} active={tab === 'note'}
                  onClick={() => setTab('note')}
                  glyph="✎" color={t.green}
                  label="Notes" count={String(counts.note)} />
              </div>
            </div>

            <form onSubmit={submitQuick} style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '10px 28px', borderBottom: `1px solid ${t.border}`,
              background: t.panel,
            }}>
              <select
                value={quickKind} onChange={(e) => setQuickKind(e.target.value as JournalKind)}
                style={{
                  background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4,
                  color: kindColor(theme, quickKind), fontFamily: monoFont, fontSize: 11,
                  padding: '5px 6px', outline: 'none', cursor: 'pointer',
                }}>
                <option value="learning">◆ Learning</option>
                <option value="next">☐ Next</option>
                <option value="note">✎ Note</option>
              </select>
              <input
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder={`Add a ${quickKind} for ${projectLabel(projectKey)}…  (Enter to save)`}
                style={{
                  flex: 1, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 4,
                  color: t.fg, fontFamily: sansFont, fontSize: 12.5,
                  padding: '6px 10px', outline: 'none',
                }}
              />
              <button type="submit" disabled={!quickText.trim()} style={{
                background: quickText.trim() ? t.accent : t.panel2,
                border: `1px solid ${quickText.trim() ? t.accent : t.border}`,
                color: quickText.trim() ? '#fff' : t.dim2,
                padding: '6px 12px', borderRadius: 4,
                fontFamily: monoFont, fontSize: 11,
                cursor: quickText.trim() ? 'pointer' : 'default',
              }}>Add</button>
            </form>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {visible.length === 0 ? (
                <div style={{
                  padding: '60px 32px', textAlign: 'center', color: t.dim,
                  fontSize: 13, lineHeight: 1.6,
                }}>
                  <div style={{ fontSize: 22, color: t.dim2, marginBottom: 8 }}>
                    {tab === 'all' ? '∗' : kindGlyph(tab)}
                  </div>
                  <div style={{ color: t.fg, marginBottom: 4 }}>
                    No {tab === 'all' ? 'entries' : `${kindLabel(tab).toLowerCase()}s`} yet for {projectLabel(projectKey)}.
                  </div>
                  <div style={{ fontFamily: monoFont, fontSize: 11, color: t.dim2 }}>
                    Add one above, capture from a session, or hit "summarize → journal" inside any session.
                  </div>
                </div>
              ) : (
                visible.map((it) => (
                  <JournalItemRow
                    key={it.id} theme={theme} item={it}
                    sessions={sessions}
                    onToggleDone={journal.toggleDone}
                    onRemove={journal.remove}
                    onUpdate={journal.update}
                    onJumpToSession={onJumpToSession}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyProjectState({ theme }: { theme: ThemeMode }) {
  const t = themes[theme];
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 6, color: t.dim,
      padding: 40, fontSize: 13, textAlign: 'center',
    }}>
      <div style={{ fontSize: 26, color: t.dim2 }}>✎</div>
      <div style={{ color: t.fg }}>Pick a project on the left.</div>
      <div style={{ fontFamily: monoFont, fontSize: 11, color: t.dim2 }}>
        Or capture from a session to start one.
      </div>
    </div>
  );
}

interface FilterPillProps {
  theme: ThemeMode;
  active: boolean;
  onClick: () => void;
  glyph: string;
  color: string;
  label: string;
  count: string;
}
function FilterPill({ theme, active, onClick, glyph, color, label, count }: FilterPillProps) {
  const t = themes[theme];
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 10px', borderRadius: 4,
      background: active ? t.panel2 : 'transparent',
      border: `1px solid ${active ? color + '55' : t.border}`,
      color: active ? t.fg : t.dim,
      fontFamily: monoFont, fontSize: 11, cursor: 'pointer',
    }}>
      <span style={{ color }}>{glyph}</span>
      {label}
      <span style={{ color: t.dim2, fontSize: 10.5 }}>{count}</span>
    </button>
  );
}
