import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLaunchedSession, type PendingLaunch } from './launch';
import type { Session } from './types';

const SINCE = Date.parse('2026-07-15T10:00:00Z');
const pending: PendingLaunch = { agent: 'claude', cwd: '/w/mpl', session: 'agt-claude-mpl', since: SINCE };

function sess(over: Partial<Session>): Session {
  return {
    id: 's:1', sourceId: 's', agent: 'claude', name: null, cwd: '/w/mpl', model: '',
    startedAt: '', updatedAt: '2026-07-15T10:00:05Z', messageCount: 1, costUsd: null,
    live: true, branches: 0, status: 'idle', ...over,
  };
}

test('matches a fresh session in the launched cwd', () => {
  const s = sess({ id: 'claude:new', updatedAt: '2026-07-15T10:00:05Z' });
  assert.equal(findLaunchedSession([s], pending), 'claude:new');
});

test('ignores a session in the same cwd that predates the launch', () => {
  const old = sess({ id: 'claude:old', updatedAt: '2026-07-15T09:00:00Z' });
  assert.equal(findLaunchedSession([old], pending), null);
});

test('ignores a fresh session in a different cwd', () => {
  const other = sess({ id: 'claude:other', cwd: '/w/elsewhere', updatedAt: '2026-07-15T10:00:05Z' });
  assert.equal(findLaunchedSession([other], pending), null);
});

test('ignores a different agent', () => {
  const codex = sess({ id: 'codex:x', agent: 'codex', updatedAt: '2026-07-15T10:00:05Z' });
  assert.equal(findLaunchedSession([codex], pending), null);
});

test('returns null when nothing matches', () => {
  assert.equal(findLaunchedSession([], pending), null);
});
