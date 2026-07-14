import { useState } from 'react';
import { useBoard, useEventStream } from '../api';
import { themes, type ThemeMode } from '../theme';
import type { BoardColumn } from '../../shared/types';
import { BoardCard } from './BoardCard';

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'running', label: 'Running' },
  { key: 'needs-input', label: 'Needs Input' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'done', label: 'Done / Idle' },
];

const WINDOWS: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: 'Live-only', hours: 0 },
];

export function BoardView({ theme, onOpenSession }: { theme: ThemeMode; onOpenSession: (id: string) => void }) {
  const t = themes[theme];
  const [windowH, setWindowH] = useState(6);
  const [refreshKey, setRefreshKey] = useState(0);
  useEventStream(() => setRefreshKey((k) => k + 1));
  const { data, error } = useBoard(windowH, refreshKey);

  const byColumn = (col: BoardColumn) => data.filter((e) => e.column === col);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg, color: t.fg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                    borderBottom: `1px solid ${t.border}` }}>
        <div style={{ flex: 1 }} />
        {WINDOWS.map((w) => (
          <button key={w.label} onClick={() => setWindowH(w.hours)}
                  style={{ fontSize: 12, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                           border: `1px solid ${t.border}`,
                           background: windowH === w.hours ? t.panel2 : 'transparent',
                           color: windowH === w.hours ? t.fg : t.dim }}>
            {w.label}
          </button>
        ))}
      </div>
      {error && <div style={{ padding: 12, color: '#E5484D', fontSize: 12 }}>{error.message}</div>}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 12, padding: 12, overflow: 'hidden' }}>
        {COLUMNS.map((col) => {
          const items = byColumn(col.key);
          return (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.fg2, marginBottom: 8,
                            display: 'flex', gap: 6 }}>
                <span>{col.label}</span>
                <span style={{ color: t.dim }}>{items.length}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {items.map((e) => <BoardCard key={e.session.id} entry={e} theme={theme} onOpen={onOpenSession} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
