import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveColumn, RUNNING_SEC, STALL_MAX_SEC } from './status';

test('recent activity => running regardless of kind', () => {
  assert.equal(deriveColumn({ ageSec: 0, lastKind: 'turn_done', paneAlive: false }), 'running');
  assert.equal(deriveColumn({ ageSec: RUNNING_SEC - 1, lastKind: 'tool_pending', paneAlive: false }), 'running');
});

test('tool_pending with a confirmed prompt => needs-approval', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'tool_pending', paneAlive: true, awaitingApproval: true }), 'needs-approval');
});

test('tool_pending on a live pane with NO prompt => running (tool executing)', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'tool_pending', paneAlive: true, awaitingApproval: false }), 'running');
});

test('tool_pending, no pane, recent, no prompt => running (assume executing)', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'tool_pending', paneAlive: false }), 'running');
});

test('confirmed prompt beats age — old tool_pending still needs-approval', () => {
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC + 1, lastKind: 'tool_pending', paneAlive: true, awaitingApproval: true }), 'needs-approval');
});

test('turn_done within stall window => needs-input', () => {
  assert.equal(deriveColumn({ ageSec: 60, lastKind: 'turn_done', paneAlive: false }), 'needs-input');
});

test('old + dead => done', () => {
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC + 1, lastKind: 'turn_done', paneAlive: false }), 'done');
  assert.equal(deriveColumn({ ageSec: STALL_MAX_SEC + 1, lastKind: 'tool_pending', paneAlive: false }), 'done');
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
