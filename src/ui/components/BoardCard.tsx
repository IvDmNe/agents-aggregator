import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { sendSessionInput } from '../api';
import { themes, type ThemeMode } from '../theme';
import type { BoardEntry } from '../../shared/types';

function basename(p: string): string {
  if (!p) return '(no cwd)';
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

export function BoardCard({ entry, theme }: { entry: BoardEntry; theme: ThemeMode }) {
  const t = themes[theme];
  const s = entry.session;
  const canSend = entry.column === 'needs-input' || entry.column === 'needs-approval';
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true); setErr(null);
    try { await sendSessionInput(s.id, text); setText(''); }
    catch (e) { setErr((e as Error).message); }
    finally { setSending(false); }
  };

  return (
    <div style={{
      border: `1px solid ${t.border}`, borderRadius: 8, background: t.panel,
      padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <Link to="/session/$id" params={{ id: s.id }} style={{ textDecoration: 'none', color: t.fg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
          {entry.live && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5EE0B4' }} />}
          <span style={{ color: t.fg2 }}>{s.agent}</span>
          <span style={{ color: t.dim }}>·</span>
          <span>{basename(s.cwd)}</span>
        </div>
        {s.name && <div style={{ fontSize: 12, color: t.fg2, marginTop: 2 }}>{s.name}</div>}
        {entry.lastLine && (
          <div style={{ fontSize: 11, color: t.dim, marginTop: 3, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.lastLine}
          </div>
        )}
      </Link>
      {canSend && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
            placeholder="Send input…"
            style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px',
                     background: t.panel2, border: `1px solid ${t.border}`, borderRadius: 5,
                     color: t.fg, outline: 'none' }}
          />
          <button onClick={() => void send()} disabled={sending}
                  style={{ fontSize: 11, padding: '4px 8px', border: `1px solid ${t.border}`,
                           borderRadius: 5, background: 'transparent', color: t.fg2, cursor: 'pointer' }}>
            ⏎
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: 10, color: '#E5484D' }}>{err}</div>}
    </div>
  );
}
