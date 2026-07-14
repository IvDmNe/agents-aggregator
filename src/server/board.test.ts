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
const no = () => false;
const atP = (agent: string, cwd: string) => agent === 'claude' && cwd === '/p';

test('drops sessions outside window and not live', () => {
  const r = buildBoard([sess({ updatedAt: iso(12 * 3600 * 1000), live: false })], no, no, NOW, 6);
  assert.equal(r.length, 0);
});

test('keeps live session even if old', () => {
  const r = buildBoard([sess({ updatedAt: iso(48 * 3600 * 1000), live: true })], no, no, NOW, 6);
  assert.equal(r.length, 1);
});

test('tool_pending with a confirmed approval prompt => needs-approval', () => {
  const r = buildBoard(
    [sess({ updatedAt: iso(60_000), lastKind: 'tool_pending', cwd: '/p' })],
    atP, atP, NOW, 6, // alive AND awaiting approval
  );
  assert.equal(r[0].column, 'needs-approval');
});

test('tool_pending on a live pane with NO prompt => running (tool executing)', () => {
  const r = buildBoard(
    [sess({ updatedAt: iso(60_000), lastKind: 'tool_pending', cwd: '/p' })],
    atP, no, NOW, 6, // alive but no prompt on screen
  );
  assert.equal(r[0].column, 'running');
});

test('carries lastLine and live through to the entry', () => {
  const r = buildBoard([sess({ updatedAt: iso(60_000), lastLine: 'running tests', live: true })], no, no, NOW, 6);
  assert.equal(r[0].lastLine, 'running tests');
  assert.equal(r[0].live, true);
});

test('parseWindowH: missing param defaults to 6', () => { assert.equal(parseWindowH(null), 6); });
test('parseWindowH: "0" stays 0 (live-only)', () => { assert.equal(parseWindowH('0'), 0); });
test('parseWindowH: "24" parses to 24', () => { assert.equal(parseWindowH('24'), 24); });
test('parseWindowH: non-numeric falls back to 6', () => { assert.equal(parseWindowH('abc'), 6); });
