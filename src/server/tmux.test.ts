import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeApprovalPrompt,
  worktreePath,
  agentSessionName,
  uniqueName,
  mergeBranchList,
} from './tmux';

// A realistic Claude Code permission dialog as captured by `tmux capture-pane -p`.
const APPROVAL_PROMPT = `
╭─────────────────────────────────────────────╮
│ Bash command                                 │
│                                              │
│   rm -rf build                               │
│   Remove the build directory                 │
│                                              │
│ Do you want to proceed?                      │
│ ❯ 1. Yes                                     │
│   2. Yes, and don't ask again this session   │
│   3. No, and tell Claude what to do (esc)    │
╰─────────────────────────────────────────────╯
`;

const EDIT_PROMPT = `
│ Do you want to make this edit to server.ts?  │
│ ❯ 1. Yes                                     │
│   2. No                                      │
`;

// Real "actively working" capture (from a live auto-mode agent). Not a prompt.
const WORKING = `
  ⎿  Allowed by auto mode classifier
✽ Philosophising… (2m 42s · ↓ 8.5k tokens)
  ⎿  Tip: Use /btw to ask a quick side question
❯
  📁 /home/ivan/projects/mpl  ★ Opus 4.8
  ⏵⏵ auto mode on (shift+tab to cycle)
`;

// Real "idle, waiting for input" capture. Not an approval prompt.
const IDLE = `
  What would you like to work on?
✻ Churned for 3s
❯ source ~/.zshrc and test pi on a GIT branch
`;

test('detects a Bash approval prompt', () => {
  assert.equal(looksLikeApprovalPrompt(APPROVAL_PROMPT), true);
});

test('detects an edit approval prompt', () => {
  assert.equal(looksLikeApprovalPrompt(EDIT_PROMPT), true);
});

test('working (spinner) output is not an approval prompt', () => {
  assert.equal(looksLikeApprovalPrompt(WORKING), false);
});

test('idle waiting-for-input output is not an approval prompt', () => {
  assert.equal(looksLikeApprovalPrompt(IDLE), false);
});

test('empty capture is not an approval prompt', () => {
  assert.equal(looksLikeApprovalPrompt(''), false);
});

test('worktreePath appends a slash-sanitized branch to the repo root', () => {
  assert.equal(worktreePath('/home/u/mpl', 'feature-x'), '/home/u/mpl-feature-x');
  assert.equal(worktreePath('/home/u/mpl', 'user/thing'), '/home/u/mpl-user-thing');
});

test('agentSessionName is prefixed, sanitized, and tmux-safe', () => {
  assert.equal(agentSessionName('claude', 'mpl'), 'agt-claude-mpl');
  // dots/spaces/colons collapse to single dashes, no leading/trailing dash
  assert.equal(agentSessionName('codex', 'my proj.v2'), 'agt-codex-my-proj-v2');
});

test('uniqueName returns base when free, else -2, -3…', () => {
  assert.equal(uniqueName('agt-claude-mpl', () => false), 'agt-claude-mpl');
  const taken = new Set(['agt-claude-mpl', 'agt-claude-mpl-2']);
  assert.equal(uniqueName('agt-claude-mpl', (n) => taken.has(n)), 'agt-claude-mpl-3');
});

test('mergeBranchList: locals first, remotes only if no local counterpart, unique', () => {
  assert.deepEqual(
    mergeBranchList(['main', 'feat'], ['main', 'feat', 'release', 'release']),
    ['main', 'feat', 'release'],
  );
});
