import { useEffect, useState } from 'react';
import { fetchBranches, launchSession, type LaunchResult } from '../api';
import { monoFont, themes, type ThemeMode } from '../theme';
import type { AgentType } from '../../shared/types';

const AGENTS: AgentType[] = ['claude', 'codex', 'pi', 'opencode'];

interface LauncherModalProps {
  theme: ThemeMode;
  /** Known project cwds for the folder autocomplete. */
  projectCwds: string[];
  onClose: () => void;
  onLaunched: (result: LaunchResult) => void;
}

export function LauncherModal({ theme, projectCwds, onClose, onLaunched }: LauncherModalProps) {
  const t = themes[theme];
  const [agent, setAgent] = useState<AgentType>('claude');
  const [dir, setDir] = useState('');
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load branches for the chosen folder (debounced), for the branch datalist.
  useEffect(() => {
    if (!dir.trim()) { setBranches([]); setCurrent(null); return; }
    const ac = new AbortController();
    const id = setTimeout(() => {
      fetchBranches(dir.trim(), ac.signal)
        .then((r) => { setBranches(r.branches); setCurrent(r.current); })
        .catch(() => { setBranches([]); setCurrent(null); });
    }, 300);
    return () => { clearTimeout(id); ac.abort(); };
  }, [dir]);

  const launch = async () => {
    if (!dir.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await launchSession({ agent, dir: dir.trim(), branch: branch.trim() || undefined });
      onLaunched(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: 11, color: t.dim, marginBottom: 4, display: 'block' } as const;
  const field = {
    width: '100%', boxSizing: 'border-box' as const, fontSize: 13, padding: '7px 9px',
    background: t.panel2, border: `1px solid ${t.border}`, borderRadius: 6,
    color: t.fg, outline: 'none', fontFamily: 'inherit',
  } as const;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '92vw', background: t.bg,
          border: `1px solid ${t.border}`, borderRadius: 10, padding: 18,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: t.fg }}>New agent session</div>

        <div>
          <span style={label}>Harness</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {AGENTS.map((a) => (
              <button
                key={a}
                onClick={() => setAgent(a)}
                style={{
                  flex: 1, fontSize: 12, padding: '6px 0', cursor: 'pointer',
                  borderRadius: 6, border: `1px solid ${agent === a ? t.accent : t.border}`,
                  background: agent === a ? t.panel2 : 'transparent',
                  color: agent === a ? t.fg : t.dim, fontFamily: monoFont,
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={label}>Folder</span>
          <input
            autoFocus
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="~/projects/…"
            list="launcher-folders"
            style={field}
          />
          <datalist id="launcher-folders">
            {projectCwds.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>

        <div>
          <span style={label}>
            Branch <span style={{ color: t.dim2 }}>— optional; a new name is created as a worktree</span>
          </span>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={current ? `${current} (current)` : 'leave blank for current'}
            list="launcher-branches"
            style={field}
          />
          <datalist id="launcher-branches">
            {branches.map((b) => <option key={b} value={b} />)}
          </datalist>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#E5484D', wordBreak: 'break-word' }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 12, padding: '7px 12px', cursor: 'pointer', borderRadius: 6,
              border: `1px solid ${t.border}`, background: 'transparent', color: t.dim,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void launch()}
            disabled={busy || !dir.trim()}
            style={{
              fontSize: 12, padding: '7px 14px', borderRadius: 6,
              border: `1px solid ${t.accent}`,
              background: t.accent, color: t.bg, fontWeight: 600,
              cursor: busy || !dir.trim() ? 'default' : 'pointer',
              opacity: busy || !dir.trim() ? 0.6 : 1,
            }}
          >
            {busy ? 'Launching…' : 'Launch'}
          </button>
        </div>
      </div>
    </div>
  );
}
