import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveColumn, RUNNING_SEC, STALL_MAX_SEC } from './status';

test('recent activity => running regardless of kind', () => {
  assert.equal(deriveColumn({ ageSec: 0, lastKind: 'turn_done', paneAlive: false }), 'running');
  assert.equal(deriveColumn({ ageSec: RUNNING_SEC - 1, lastKind: 'tool_pending', paneAlive: false }), 'running');
});

test('tool_pending on live pane => needs-approval', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'tool_pending', paneAlive: true }), 'needs-approval');
});

test('tool_pending within stall window (dead pane) => needs-approval', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'tool_pending', paneAlive: false }), 'needs-approval');
});

test('turn_done within stall window => needs-input', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'turn_done', paneAlive: false }), 'needs-input');
});

test('old + dead => done', () => {
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC + 1, lastKind: 'turn_done', paneAlive: false }), 'done');
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC + 1, lastKind: 'tool_pending', paneAlive: false }), 'done');
});

test('old tool_pending but pane still alive => needs-approval', () => {
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC + 1, lastKind: 'tool_pending', paneAlive: true }), 'needs-approval');
});

test('unknown kind never lands in needs-* columns', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'unknown', paneAlive: true }), 'done');
});

test('exactly RUNNING_SEC is no longer running', () => {
  assert.equal(deriveColumn({ ageSec: RUNNING_SEC, lastKind: 'turn_done', paneAlive: false }), 'needs-input');
});

test('exactly STALL_MAX_SEC with dead pane => done', () => {
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC, lastKind: 'turn_done', paneAlive: false }), 'done');
});
