import { useState } from 'react';
import { sendPaneInput } from '../api';
import { monoFont, themes, type ThemeMode } from '../theme';

function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

interface PendingChatProps {
  theme: ThemeMode;
  agent: string;
  cwd: string;
  session: string;
  onDismiss: () => void;
}

/**
 * Compose view for a just-launched agent that has no transcript yet. Sends the
 * first message straight to the agent's tmux pane; once the agent writes its
 * session, AppShell swaps this out for the live transcript.
 */
export function PendingChat({ theme, agent, cwd, session, onDismiss }: PendingChatProps) {
  const t = themes[theme];
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentAny, setSentAny] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true); setErr(null);
    try {
      await sendPaneInput({ agent, cwd, text });
      setSentAny(true);
      setText('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: t.bg, color: t.fg }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        borderBottom: `1px solid ${t.border}`,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.green, animation: 'pip 1.4s ease-in-out infinite' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: t.fg2 }}>{agent}</span>
        <span style={{ color: t.dim }}>·</span>
        <span style={{ fontSize: 13 }}>{basename(cwd)}</span>
        <span style={{ fontFamily: monoFont, fontSize: 11, color: t.dim2 }}>starting…</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onDismiss}
          style={{
            fontSize: 12, padding: '5px 10px', cursor: 'pointer', borderRadius: 6,
            border: `1px solid ${t.border}`, background: 'transparent', color: t.dim, fontFamily: monoFont,
          }}
        >
          Dismiss
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: t.fg2 }}>
          {sentAny ? 'Message delivered — waiting for the agent to start its session…' : 'New agent is ready. Send a message to begin.'}
        </div>
        <div style={{ fontSize: 12, color: t.dim, maxWidth: 460 }}>
          {basename(cwd)} · tmux <span style={{ fontFamily: monoFont }}>{session}</span>. Your message goes straight to the
          agent's pane; the live transcript opens here as soon as it responds.
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${t.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {err && <div style={{ fontSize: 12, color: '#E5484D' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }}
            placeholder="Type your first message… (Cmd/Ctrl+Enter to send)"
            rows={2}
            style={{
              flex: 1, resize: 'none', fontSize: 13, padding: '8px 10px', lineHeight: 1.4,
              background: t.panel2, border: `1px solid ${t.border}`, borderRadius: 8,
              color: t.fg, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            style={{
              alignSelf: 'flex-end', fontSize: 13, padding: '8px 16px', borderRadius: 8,
              border: `1px solid ${t.accent}`, background: t.accent, color: t.bg, fontWeight: 600,
              cursor: sending || !text.trim() ? 'default' : 'pointer',
              opacity: sending || !text.trim() ? 0.6 : 1,
            }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
