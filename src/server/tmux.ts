import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentType } from '../shared/types';

const execFileP = promisify(execFile);

export interface TmuxPane {
  target: string;
  panePid: number;
  command: string;
}

export interface ResolvedTarget {
  target: string;
  panePid: number;
  agentPid: number;
  agentCwd: string;
}

const AGENT_BINARIES: Record<AgentType, string[]> = {
  claude: ['claude'],
  codex: ['codex'],
  opencode: ['opencode'],
  pi: ['pi'],
};

export function listPanes(): TmuxPane[] {
  let out: string;
  try {
    out = execFileSync(
      'tmux',
      ['list-panes', '-a', '-F', '#{pane_pid} #{session_name}:#{window_index}.#{pane_index} #{pane_current_command}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return [];
  }
  const panes: TmuxPane[] = [];
  for (const line of out.split('\n')) {
    const m = /^(\d+)\s+(\S+)\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    panes.push({ panePid: Number(m[1]), target: m[2], command: m[3] });
  }
  return panes;
}

function readChildren(pid: number): number[] {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8');
    return raw.trim().split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function readComm(pid: number): string {
  try {
    return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
  } catch {
    return '';
  }
}

function readCmdlineArgv0(pid: number): string {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    const first = raw.split('\0')[0] ?? '';
    return path.basename(first);
  } catch {
    return '';
  }
}

function readProcCwd(pid: number): string | null {
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

function findDescendantMatching(rootPid: number, names: string[]): number | null {
  const queue: number[] = [rootPid];
  const seen = new Set<number>();
  while (queue.length) {
    const pid = queue.shift()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const comm = readComm(pid);
    const argv0 = readCmdlineArgv0(pid);
    if (names.includes(comm) || names.includes(argv0)) return pid;
    for (const c of readChildren(pid)) queue.push(c);
  }
  return null;
}

/**
 * Find the tmux pane currently running an agent matching the given session.
 * Strategy: enumerate panes, descend each pane's process tree looking for an
 * agent binary, then match by cwd. Returns null if no match (no tmux, no
 * agent attached, or pane lives outside a multiplexer).
 */
export function resolveTargetForSession(opts: {
  agent: AgentType;
  cwd: string;
}): ResolvedTarget | null {
  const names = AGENT_BINARIES[opts.agent];
  if (!names) return null;
  const wantCwd = path.resolve(opts.cwd);
  const matches: ResolvedTarget[] = [];
  for (const pane of listPanes()) {
    const agentPid = findDescendantMatching(pane.panePid, names);
    if (!agentPid) continue;
    const agentCwd = readProcCwd(agentPid);
    if (!agentCwd) continue;
    if (path.resolve(agentCwd) !== wantCwd) continue;
    matches.push({ target: pane.target, panePid: pane.panePid, agentPid, agentCwd });
  }
  if (matches.length === 0) return null;
  // If more than one pane matches (same agent + same cwd), we can't safely
  // pick one — return the first but log via caller. The endpoint surfaces
  // ambiguity via a separate code path if needed later.
  return matches[0];
}

function isValidTarget(target: string): boolean {
  // tmux targets: session:window.pane, session names allow most chars but
  // we're strict to avoid arg injection.
  return /^[A-Za-z0-9_.@%+-]+:\d+\.\d+$/.test(target);
}

/**
 * Send a message into a tmux pane by literally typing it, then pressing Enter.
 * Multi-line input: each line is typed literally and separated by Enter
 * (so the agent sees the same keystroke stream a human would produce).
 */
export async function sendInput(target: string, text: string): Promise<void> {
  if (!isValidTarget(target)) throw new Error(`invalid tmux target: ${target}`);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const seg = lines[i];
    if (seg.length > 0) {
      await execFileP('tmux', ['send-keys', '-t', target, '-l', '--', seg]);
    }
    if (i < lines.length - 1) {
      // Soft newline: agents typically use Shift/Alt+Enter for these.
      // Plain Enter would submit each line as its own message.
      // We approximate with a literal newline character.
      await execFileP('tmux', ['send-keys', '-t', target, 'C-j']);
    }
  }
  await execFileP('tmux', ['send-keys', '-t', target, 'Enter']);
}

/** Capture the visible text of a tmux pane (plain, no escape codes). */
function capturePane(target: string): string {
  try {
    return execFileSync('tmux', ['capture-pane', '-p', '-t', target], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/**
 * Heuristic: does captured pane text show a coding-agent permission prompt?
 * Agents render a boxed question ("Do you want to …?") with a numbered choice
 * list whose first option is a highlighted "1. Yes". Requiring both a question
 * and the Yes-choice keeps normal working output (spinners, tool logs) from
 * false-matching. Exported for testing.
 */
export function looksLikeApprovalPrompt(text: string): boolean {
  if (!text) return false;
  const hasQuestion = /Do you want to\b/i.test(text) || /Allow .+\?/i.test(text);
  const hasYesChoice = /(❯\s*)?\b1\.\s*Yes\b/.test(text);
  return hasQuestion && hasYesChoice;
}

export interface PaneSignals {
  /** `${agent} ${resolvedCwd}` keys for panes running a known agent. */
  alive: Set<string>;
  /** Subset of `alive` whose pane is currently showing a permission prompt. */
  approval: Set<string>;
}

/**
 * Walk every tmux pane once and, for each running a known agent, record its
 * `${agent} ${resolvedCwd}` key as alive — and, if its visible content shows a
 * permission prompt, as awaiting approval. One pass powers both board signals.
 */
export function paneSignals(): PaneSignals {
  const alive = new Set<string>();
  const approval = new Set<string>();
  const agents = Object.keys(AGENT_BINARIES) as AgentType[];
  for (const pane of listPanes()) {
    for (const agent of agents) {
      const pid = findDescendantMatching(pane.panePid, AGENT_BINARIES[agent]);
      if (!pid) continue;
      const cwd = readProcCwd(pid);
      if (!cwd) continue;
      const key = `${agent} ${path.resolve(cwd)}`;
      alive.add(key);
      if (looksLikeApprovalPrompt(capturePane(pane.target))) approval.add(key);
    }
  }
  return { alive, approval };
}
