import type { CSSProperties } from 'react';
import type { Session } from '../../shared/types';
import { LivePip } from './AgentChip';
import { AGENT_HUES, themes, type Theme, type ThemeMode } from '../theme';

export interface TabSession {
  id: string;
  name: string | null;
  agent: Session['agent'];
  live: boolean;
}

interface TabBarProps {
  theme: ThemeMode;
  pinnedSessions: TabSession[];
  activeTab: string;
  setActiveTab: (id: string) => void;
  onUnpin: (id: string) => void;
  loud: boolean;
}

export function TabBar({ theme, pinnedSessions, activeTab, setActiveTab, onUnpin, loud }: TabBarProps) {
  const t = themes[theme];
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      borderBottom: `1px solid ${t.border}`,
      background: t.panel,
      paddingLeft: 4, paddingRight: 8,
      minHeight: 36,
      gap: 0,
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      <TabChip
        theme={theme}
        active={activeTab === 'home'}
        onClick={() => setActiveTab('home')}
        kind="home"
        loud={loud}
      />
      {pinnedSessions.map((s) => (
        <TabChip
          key={s.id}
          theme={theme}
          loud={loud}
          active={activeTab === s.id}
          onClick={() => setActiveTab(s.id)}
          onClose={(e) => { e.stopPropagation(); onUnpin(s.id); }}
          session={s}
        />
      ))}
      <div style={{ flex: 1 }} />
    </div>
  );
}

interface TabChipProps {
  theme: ThemeMode;
  active: boolean;
  onClick: () => void;
  onClose?: (e: React.MouseEvent) => void;
  kind?: 'home';
  session?: TabSession;
  loud: boolean;
}

function TabChip({ theme, active, onClick, onClose, kind, session: s, loud }: TabChipProps) {
  const t = themes[theme];
  const isHome = kind === 'home';

  const railColor = isHome ? t.accent : (s ? AGENT_HUES[theme][s.agent].fg : t.accent);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: isHome ? '0 14px 0 12px' : '0 8px 0 12px',
        cursor: 'pointer',
        background: active ? t.bg : 'transparent',
        borderRight: `1px solid ${t.border}`,
        borderLeft: isHome ? `1px solid ${t.border}` : 'none',
        minWidth: isHome ? 0 : 160, maxWidth: 240,
        fontSize: 12,
        color: active ? t.fg : t.dim,
      } as CSSProperties}
    >
      {active && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: railColor,
        }} />
      )}

      {isHome || !s ? (
        <>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, color: active ? t.fg : t.dim,
          }}>
            <svg viewBox="0 0 16 16" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.4}>
              <path d="M2 7.5L8 2.5l6 5V13.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-6z" />
            </svg>
          </span>
          <span style={{ fontWeight: 500 }}>Home</span>
        </>
      ) : (
        <>
          <span style={{
            width: 8, height: 8, borderRadius: 2,
            background: AGENT_HUES[theme][s.agent].fg, flexShrink: 0,
          }} />
          <span style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {truncate(s.name, 24) || <span style={{ color: t.dim2, fontStyle: 'italic' }}>Untitled</span>}
          </span>
          {s.live && (
            <span style={{ flexShrink: 0 }}>
              <LivePip theme={theme} loud={loud} size={5} />
            </span>
          )}
          <CloseButton t={t} onClick={onClose} />
        </>
      )}
    </div>
  );
}

function CloseButton({ t, onClick }: { t: Theme; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title="Unpin"
      style={{
        flexShrink: 0,
        width: 18, height: 18, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4, border: 'none',
        background: 'transparent', color: t.dim2,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = t.panel2; e.currentTarget.style.color = t.fg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.dim2; }}
    >
      <svg viewBox="0 0 12 12" width={9} height={9} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  );
}

function truncate(s: string | null, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
