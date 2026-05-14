import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type MouseEvent, type ReactNode,
} from 'react';
import { fetchSessionFile, type SessionFile, type SessionFileError } from '../api';
import { monoFont, themes, type ThemeMode } from '../theme';
import { CodeView } from './CodeView';
import { DiffView } from './DiffView';
import { SideBySideDiff } from './SideBySideDiff';

export type ViewMode = 'unified' | 'split' | 'current';
const VIEW_MODE_KEY = 'aa.filePreview.viewMode';

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    if (v === 'split' || v === 'unified' || v === 'current') return v;
  } catch { /* localStorage may be unavailable */ }
  return 'unified';
}

function saveViewMode(m: ViewMode): void {
  try { localStorage.setItem(VIEW_MODE_KEY, m); } catch { /* ignore */ }
}

export interface FileEdit {
  oldText: string;
  newText: string;
}

export interface FilePreview {
  path: string;
  tool: string;
  edits: FileEdit[];
  /** Composite session id (`sourceId:sessionId`). Required for "view current file". */
  sessionId?: string;
}

interface FilePreviewContextValue {
  open: (preview: FilePreview) => void;
}

const FilePreviewContext = createContext<FilePreviewContextValue | null>(null);

export function useFilePreview(): FilePreviewContextValue {
  const ctx = useContext(FilePreviewContext);
  if (!ctx) throw new Error('FilePreviewProvider missing');
  return ctx;
}

/**
 * Build a FilePreview from a tool entry's args. Returns null for tools we
 * don't know how to expand into a diff (e.g. Read, Grep).
 */
export function previewFromArgs(
  tool: string | undefined,
  args: Record<string, unknown> | undefined,
  sessionId?: string,
): FilePreview | null {
  if (!args) return null;
  const path = typeof args.path === 'string' ? args.path : '';
  if (!path) return null;

  // Single-edit
  if (typeof args.old_string === 'string' && typeof args.new_string === 'string') {
    return {
      path, tool: tool ?? 'Edit', sessionId,
      edits: [{ oldText: args.old_string, newText: args.new_string }],
    };
  }

  // Multi-edit
  if (Array.isArray(args.edits)) {
    const edits: FileEdit[] = [];
    for (const ed of args.edits as Array<{ old_string?: unknown; new_string?: unknown }>) {
      if (typeof ed?.old_string === 'string' && typeof ed?.new_string === 'string') {
        edits.push({ oldText: ed.old_string, newText: ed.new_string });
      }
    }
    if (edits.length > 0) return { path, tool: tool ?? 'MultiEdit', edits, sessionId };
  }

  // Write / new-file
  if (typeof args.content === 'string') {
    return {
      path, tool: tool ?? 'Write', sessionId,
      edits: [{ oldText: '', newText: args.content }],
    };
  }

  return null;
}

interface ProviderProps { theme: ThemeMode; children: ReactNode; }

export function FilePreviewProvider({ theme, children }: ProviderProps) {
  const [preview, setPreview] = useState<FilePreview | null>(null);

  const open = useCallback((p: FilePreview) => setPreview(p), []);
  const close = useCallback(() => setPreview(null), []);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, close]);

  useEffect(() => {
    if (!preview) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [preview]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <FilePreviewContext.Provider value={value}>
      {children}
      {preview && <Overlay theme={theme} preview={preview} onClose={close} />}
    </FilePreviewContext.Provider>
  );
}

interface OverlayProps {
  theme: ThemeMode;
  preview: FilePreview;
  onClose: () => void;
}

function Overlay({ theme, preview, onClose }: OverlayProps) {
  const t = themes[theme];
  const stop = (e: MouseEvent) => e.stopPropagation();
  const totalEdits = preview.edits.length;
  const isNewFile = totalEdits === 1 && preview.edits[0].oldText === '';
  const [mode, setMode] = useState<ViewMode>(() => loadViewMode());
  const changeMode = (m: ViewMode) => { setMode(m); saveViewMode(m); };
  const canFetchCurrent = !!preview.sessionId;

  // Prefetch the on-disk file as soon as the modal opens, so flipping to
  // 'current' is instant. Deps are stable for a single modal open; in dev
  // StrictMode the first invocation's fetch is aborted by the cleanup, but
  // the second invocation kicks off a fresh one that completes normally.
  const [file, setFile] = useState<SessionFile | null>(null);
  const [fileErr, setFileErr] = useState<SessionFileError | null>(null);
  const [loading, setLoading] = useState(canFetchCurrent);
  useEffect(() => {
    if (!canFetchCurrent || !preview.sessionId) return;
    const ac = new AbortController();
    setLoading(true);
    setFile(null);
    setFileErr(null);
    fetchSessionFile(preview.sessionId, preview.path, ac.signal)
      .then((f) => { if (!ac.signal.aborted) { setFile(f); setLoading(false); } })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        if (e && typeof e === 'object' && 'status' in e) setFileErr(e as SessionFileError);
        else setFileErr({ status: 0, error: (e as Error).message ?? 'fetch failed' });
        setLoading(false);
      });
    return () => ac.abort();
  }, [canFetchCurrent, preview.sessionId, preview.path]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483646,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={stop}
        style={{
          width: 'min(96vw, 1200px)',
          height: '92vh',
          display: 'flex', flexDirection: 'column',
          background: t.bg, color: t.fg,
          border: `1px solid ${t.border}`, borderRadius: 8,
          boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          padding: '10px 14px', background: t.panel2,
          borderBottom: `1px solid ${t.border}`,
          fontFamily: monoFont, fontSize: 12.5, color: t.dim,
        }}>
          <span style={{ color: t.accent }}>▸</span>
          <span style={{ color: t.fg, fontWeight: 500 }}>{preview.tool}</span>
          <span style={{
            flex: 1, minWidth: 0, color: t.fg2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={preview.path}>{preview.path}</span>
          <span style={{ color: isNewFile ? t.green : t.dim2 }}>
            {isNewFile
              ? 'new file'
              : totalEdits === 1 ? '1 edit' : `${totalEdits} edits`}
          </span>
          <ModeToggle
            theme={theme} mode={mode} onChange={changeMode}
            disableSplit={isNewFile}
            disableCurrent={!canFetchCurrent}
          />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'transparent', color: t.fg2,
              border: `1px solid ${t.border}`, borderRadius: 6,
              padding: '3px 9px', fontSize: 13, lineHeight: 1, cursor: 'pointer',
            }}
          >✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: t.bg }}>
          {mode === 'current' ? (
            <CurrentFileBody
              theme={theme} path={preview.path}
              file={file} err={fileErr} loading={loading}
            />
          ) : isNewFile ? (
            <CodeView
              theme={theme}
              path={preview.path}
              code={preview.edits[0].newText}
            />
          ) : (
            preview.edits.map((ed, i) => (
              <div key={i} style={{
                borderTop: i === 0 ? 'none' : `1px solid ${t.border2}`,
              }}>
                {totalEdits > 1 && (
                  <div style={{
                    padding: '6px 14px', fontSize: 11.5, color: t.dim2,
                    fontFamily: monoFont, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    background: t.panel,
                  }}>
                    edit {i + 1} / {totalEdits}
                  </div>
                )}
                {mode === 'split' ? (
                  <SideBySideDiff
                    theme={theme}
                    oldText={ed.oldText}
                    newText={ed.newText}
                    maxLines={100000}
                    maxHeight="none"
                  />
                ) : (
                  <DiffView
                    theme={theme}
                    oldText={ed.oldText}
                    newText={ed.newText}
                    maxLines={100000}
                    maxHeight="none"
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${t.border}`,
          background: t.panel2, color: t.dim2,
          fontFamily: monoFont, fontSize: 11.5,
        }}>
          Esc to close · click outside to dismiss
        </div>
      </div>
    </div>
  );
}

interface ModeToggleProps {
  theme: ThemeMode;
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  disableSplit?: boolean;
  disableCurrent?: boolean;
}

function ModeToggle({ theme, mode, onChange, disableSplit, disableCurrent }: ModeToggleProps) {
  const t = themes[theme];
  const opts: ViewMode[] = ['unified', 'split', 'current'];
  return (
    <div role="group" aria-label="View mode" style={{
      display: 'inline-flex', border: `1px solid ${t.border}`, borderRadius: 6,
      overflow: 'hidden', fontFamily: monoFont, fontSize: 11.5, lineHeight: 1,
    }}>
      {opts.map((opt, i) => {
        const active = mode === opt;
        const disabled = (opt === 'split' && disableSplit) || (opt === 'current' && disableCurrent);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt)}
            aria-pressed={active}
            title={disabled
              ? (opt === 'split' ? 'No old content to compare' : 'No file path available')
              : undefined}
            style={{
              background: active ? t.accent : 'transparent',
              color: active ? '#fff' : (disabled ? t.dim2 : t.fg2),
              border: 'none',
              padding: '4px 9px',
              cursor: disabled ? 'not-allowed' : (active ? 'default' : 'pointer'),
              opacity: disabled ? 0.5 : 1,
              borderRight: i < opts.length - 1 ? `1px solid ${t.border}` : 'none',
            }}
          >{opt}</button>
        );
      })}
    </div>
  );
}

interface CurrentFileBodyProps {
  theme: ThemeMode;
  path: string;
  file: SessionFile | null;
  err: SessionFileError | null;
  loading: boolean;
}

function CurrentFileBody({ theme, path, file, err, loading }: CurrentFileBodyProps) {
  const t = themes[theme];

  if (loading) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.dim2, fontFamily: monoFont, fontSize: 12.5,
      }}>reading {path}…</div>
    );
  }

  if (err) {
    return (
      <div style={{
        margin: '14px', padding: '12px 14px',
        background: t.panel, border: `1px solid ${t.border2}`, borderRadius: 6,
        color: t.fg2, fontFamily: monoFont, fontSize: 12.5,
      }}>
        <div style={{ color: t.amber, marginBottom: 4 }}>{currentErrorTitle(err)}</div>
        <div style={{ color: t.dim }}>{path}</div>
        {err.detail && <div style={{ color: t.dim2, marginTop: 4 }}>{err.detail}</div>}
        {err.size != null && err.limit != null && (
          <div style={{ color: t.dim2, marginTop: 4 }}>
            file size {formatBytes(err.size)} · limit {formatBytes(err.limit)}
          </div>
        )}
      </div>
    );
  }

  if (!file) return null;

  return (
    <div>
      <div style={{
        padding: '6px 14px', fontSize: 11.5, color: t.dim2,
        fontFamily: monoFont, background: t.panel,
        borderBottom: `1px solid ${t.border2}`,
        display: 'flex', gap: 12, flexWrap: 'wrap',
      }}>
        <span>current on-disk file</span>
        <span>{formatBytes(file.size)}</span>
        <span>modified {new Date(file.mtime).toLocaleString()}</span>
      </div>
      <CodeView theme={theme} path={file.path} code={file.content} />
    </div>
  );
}

function currentErrorTitle(err: SessionFileError): string {
  if (err.status === 404) return 'file not found on disk';
  if (err.status === 403) return 'path escapes session cwd';
  if (err.status === 413) return 'file too large to display';
  if (err.status === 415) return 'binary file';
  return err.error || 'failed to read file';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
