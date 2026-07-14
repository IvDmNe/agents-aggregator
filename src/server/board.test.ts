import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard, parseWindowH } from './board';
import type { Session } from '../shared/types';

const NOW = Date.parse('2026-07-14T12:00:00Z');

function sess(over: Partial<Session>): Session {
  return {
    id: 's:1', sourceId: 's', agent: 'claude', name: null, cwd: '/p', model: '',
    startedAt: '2026-07-14T00:00:00Z', updatedAt: '2026-07-14T12:00:00Z',
    messageCount: 1, costUsd: null, live: false, branches: 0, status: 'idle',
    lastKind: 'turn_done', lastLine: 'hi', ...over,
  };
}

const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

test('drops sessions outside window and not live', () => {
  const r = buildBoard([sess({ updatedAt: iso(12 * 3600 * 1000), live: false })], () => false, NOW, 6);
  assert.equal(r.length, 0);
});

test('keeps live session even if old', () => {
  const r = buildBoard([sess({ updatedAt: iso(48 * 3600 * 1000), live: true })], () => false, NOW, 6);
  assert.equal(r.length, 1);
});

test('classifies tool_pending on a live pane as needs-approval', () => {
  const r = buildBoard(
    [sess({ updatedAt: iso(60_000), lastKind: 'tool_pending', cwd: '/p' })],
    (agent, cwd) => agent === 'claude' && cwd === '/p',
    NOW, 6,
  );
  assert.equal(r[0].column, 'needs-approval');
});

test('carries lastLine and live through to the entry', () => {
  const r = buildBoard([sess({ updatedAt: iso(60_000), lastLine: 'running tests', live: true })], () => false, NOW, 6);
  assert.equal(r[0].lastLine, 'running tests');
  assert.equal(r[0].live, true);
});

test('parseWindowH: missing param defaults to 6', () => { assert.equal(parseWindowH(null), 6); });
test('parseWindowH: "0" stays 0 (live-only)', () => { assert.equal(parseWindowH('0'), 0); });
test('parseWindowH: "24" parses to 24', () => { assert.equal(parseWindowH('24'), 24); });
test('parseWindowH: non-numeric falls back to 6', () => { assert.equal(parseWindowH('abc'), 6); });
