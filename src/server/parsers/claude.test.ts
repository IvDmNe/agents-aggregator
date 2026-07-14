import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLastActivity, isSubagentSessionFile } from './claude';

function asst(content: unknown[], extra: Record<string, unknown> = {}) {
  return { type: 'assistant', uuid: 'a', parentUuid: null, timestamp: '2026-07-14T00:00:00Z',
           message: { role: 'assistant', content }, ...extra } as never;
}
function user(content: unknown[], extra: Record<string, unknown> = {}) {
  return { type: 'user', uuid: 'u', parentUuid: null, timestamp: '2026-07-14T00:00:00Z',
           message: { role: 'user', content }, ...extra } as never;
}

test('finished assistant turn => turn_done', () => {
  const r = deriveLastActivity([asst([{ type: 'text', text: 'all done' }])]);
  assert.equal(r.kind, 'turn_done');
  assert.equal(r.line, 'all done');
});

test('assistant tool_use with no result => tool_pending', () => {
  const r = deriveLastActivity([
    asst([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
  ]);
  assert.equal(r.kind, 'tool_pending');
});

test('tool_use answered by later tool_result => not pending; last is user => working', () => {
  const r = deriveLastActivity([
    asst([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
    user([{ type: 'tool_result', tool_use_id: 't1', content: 'file.txt' }]),
  ]);
  assert.equal(r.kind, 'working');
});

test('sidechain lines are ignored', () => {
  const r = deriveLastActivity([
    asst([{ type: 'text', text: 'main' }]),
    asst([{ type: 'text', text: 'sidechain' }], { isSidechain: true }),
  ]);
  assert.equal(r.line, 'main');
});

test('no messages => unknown', () => {
  assert.equal(deriveLastActivity([]).kind, 'unknown');
});

test('isSubagentSessionFile: true for a file under a subagents/ dir', () => {
  assert.equal(
    isSubagentSessionFile('/home/u/.claude/projects/-p/uuid/subagents/agent-abc.jsonl'),
    true,
  );
});

test('isSubagentSessionFile: false for a normal top-level session file', () => {
  assert.equal(
    isSubagentSessionFile('/home/u/.claude/projects/-p/uuid.jsonl'),
    false,
  );
});

test('isSubagentSessionFile: does not match a project dir merely containing the substring', () => {
  assert.equal(
    isSubagentSessionFile('/home/u/.claude/projects/-my-subagents-tool/uuid.jsonl'),
    false,
  );
});
