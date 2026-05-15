import { useMemo } from 'react';
import type { Session } from '../../shared/types';
import { monoFont, themes, type ThemeMode } from '../theme';
import { projectKeyFor, projectLabel, type JournalItem } from './types';

interface ProjectSummary {
  key: string;
  label: string;
  sessions: number;
  items: number;
  lastTouched: number;
  learnings: number;
  next: number;
  openNext: number;
}

interface JournalProjectRailProps {
  theme: ThemeMode;
  items: JournalItem[];
  projectKey: string | null;
  setProjectKey: (key: string) => void;
  sessions: Session[];
}

export function JournalProjectRail({ theme, items, projectKey, setProjectKey, sessions }: JournalProjectRailProps) {
  const t = themes[theme];

  const projects = useMemo<ProjectSummary[]>(() => {
    const m = new Map<string, ProjectSummary>();
    const empty = (key: string): ProjectSummary => ({
      key, label: projectLabel(key),
      sessions: 0, items: 0, lastTouched: 0,
      learnings: 0, next: 0, openNext: 0,
    });
    for (const s of sessions) {
      if (!s.cwd) continue;
      const key = projectKeyFor(s.cwd);
      if (!m.has(key)) m.set(key, empty(key));
      m.get(key)!.sessions += 1;
    }
    for (const it of items) {
      const key = it.projectKey;
      if (!m.has(key)) m.set(key, empty(key));
      const p = m.get(key)!;
      p.items += 1;
      p.lastTouched = Math.max(p.lastTouched, it.createdAt || 0);
      if (it.kind === 'learning') p.learnings += 1;
      if (it.kind === 'next') {
        p.next += 1;
        if (!it.done) p.openNext += 1;
      }
    }
    return [...m.values()].sort((a, b) => b.lastTouched - a.lastTouched || b.items - a.items);
  }, [items, sessions]);

  return (
    <div style={{
      borderRight: `1px solid ${t.border}`, background: t.panel,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: t.dim2, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          Projects
        </span>
        <span style={{ marginLeft: 'auto', color: t.dim2, fontSize: 11, fontFamily: monoFont }}>
          {projects.length}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 8px' }}>
        {projects.length === 0 ? (
          <div style={{ padding: '14px', color: t.dim2, fontSize: 12, fontFamily: monoFont }}>
            No projects yet.
          </div>
        ) : projects.map((p) => {
          const active = p.key === projectKey;
          return (
            <div key={p.key} onClick={() => setProjectKey(p.key)} style={{
              display: 'flex', flexDirection: 'column', gap: 3,
              padding: '8px 10px',
              margin: '1px 0', borderRadius: 5,
              background: active ? t.panel2 : 'transparent',
              borderLeft: active ? `2px solid ${t.accent}` : '2px solid transparent',
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  color: t.fg, fontSize: 12.5, fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                }}>{p.label}</span>
                <span style={{ color: t.dim2, fontSize: 11, fontFamily: monoFont }}>{p.items}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontFamily: monoFont, fontSize: 10.5, color: t.dim2 }}>
                <span style={{
                  color: t.dim,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1, minWidth: 0,
                }}>{p.key}</span>
                {p.openNext > 0 && <span style={{ color: t.accent }}>{p.openNext}☐</span>}
                {p.learnings > 0 && <span style={{ color: t.amber }}>{p.learnings}◆</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
