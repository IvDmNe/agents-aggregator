import fs from 'node:fs';
import path from 'node:path';
import { composeSessionId, type Entry, type Session } from '../../shared/types';
import type { Parser, SessionFile } from './base';

/**
 * Codex CLI session format. Every line is { timestamp, type, payload }.
 *
 *   - session_meta     header: id, cwd, model_provider, cli_version
 *   - turn_context     model/sandbox config for a turn (model lives here)
 *   - event_msg        coarse-grained UI events: task_started, agent_message,
 *                      token_count, task_complete… mostly redundant with the
 *                      response_item stream, so we ignore them for entries.
 *   - response_item    the OpenAI Responses-API shape:
 *       message        role developer|user|assistant, content[].input_text/output_text
 *       reasoning      may have a `summary` array; encrypted_content is opaque
 *       function_call  { name, arguments (JSON string), call_id }
 *       function_call_output { call_id, output }
 *
 * Codex's primary tool is `exec_command`. File edits arrive as
 * `custom_tool_call` payloads with `name === 'apply_patch'` and an `input`
 * string in the OpenAI apply_patch envelope format — we parse those into
 * per-file diff entries so the UI can render them like Claude's Edit/Write.
 */

interface CodexLine {
  timestamp: string;
  type: 'session_meta' | 'event_msg' | 'response_item' | 'turn_context' | string;
  payload: any;
}

function readJsonl(filePath: string): CodexLine[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const out: CodexLine[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line) as CodexLine); } catch { /* skip */ }
  }
  return out;
}

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(11, 19);
  } catch { return iso; }
}

function isEnvelopeTag(text: string): boolean {
  const trimmed = text.trim();
  // Whole-message wrappers Codex auto-injects on every turn — skip from chat view.
  return /^<environment_context>[\s\S]*<\/environment_context>$/.test(trimmed)
      || /^<user_instructions>[\s\S]*<\/user_instructions>$/.test(trimmed)
      || /^<permissions [^>]*>[\s\S]*<\/permissions>$/.test(trimmed);
}

function collectText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((p): p is { type: string; text: string } =>
      typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).text === 'string',
    )
    .map((p) => p.text).join('\n');
}

interface FnCall { id: string; name: string; argsRaw: string; callId: string; ts: string; lineIndex: number; }
interface FnOut { callId: string; output: string; ts: string; }

function parseFnArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { return {}; }
}

export const codexParser: Parser = {
  agent: 'codex',

  listSessions(root: string): SessionFile[] {
    const sessionsDir = path.join(root, 'sessions');
    if (!fs.existsSync(sessionsDir)) return [];
    const out: SessionFile[] = [];
    // YYYY/MM/DD nesting; do a flat recursive walk for any rollout-*.jsonl
    walk(sessionsDir, (file) => {
      if (!file.endsWith('.jsonl')) return;
      const base = path.basename(file);
      if (!base.startsWith('rollout-')) return;
      // Filename is rollout-<ISO>-<uuid>.jsonl — sessionId is the uuid suffix.
      const m = base.match(/-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/);
      const sessionId = m?.[1] ?? base.replace(/\.jsonl$/, '');
      out.push({ sessionId, filePath: file });
    });
    return out;
  },

  parseSession(filePath: string, sourceId: string): Session & { filePath: string } {
    const lines = readJsonl(filePath);
    let header: { id?: string; cwd?: string; timestamp?: string } = {};
    let model = '';
    let messageCount = 0;
    let firstUserText: string | null = null;
    let lastTs: string | null = null;

    for (const l of lines) {
      if (l.type === 'session_meta') header = l.payload ?? {};
      else if (l.type === 'turn_context' && typeof l.payload?.model === 'string') model = l.payload.model;
      else if (l.type === 'response_item') {
        const p = l.payload;
        if (p?.type === 'message') {
          const role = p.role;
          if (role === 'user' || role === 'assistant') {
            messageCount += 1;
            if (role === 'user' && !firstUserText) {
              const text = collectText(p.content);
              if (text && !isEnvelopeTag(text)) firstUserText = text;
            }
          }
        }
      }
      if (l.timestamp) lastTs = l.timestamp;
    }
    const stat = fs.statSync(filePath);
    const sessionId = header.id ?? path.basename(filePath, '.jsonl');
    const startedAt = header.timestamp ?? stat.birthtime.toISOString();
    const updatedAt = lastTs ?? stat.mtime.toISOString();
    const name = firstUserText
      ? firstUserText.length > 80 ? firstUserText.slice(0, 80) + '…' : firstUserText
      : null;
    return {
      id: composeSessionId(sourceId, sessionId),
      sourceId,
      agent: 'codex',
      name,
      cwd: header.cwd ?? '',
      model,
      startedAt,
      updatedAt,
      messageCount,
      costUsd: null,
      live: false,
      branches: 0,
      status: 'idle',
      filePath,
    };
  },

  parseEntries(filePath: string): Entry[] {
    const lines = readJsonl(filePath);

    // First pass: gather exec_command + apply_patch calls and their outputs by
    // call_id so we can fold outputs into the rendered entry.
    const execCalls = new Map<string, FnCall>();
    const applyPatchCallIds = new Set<string>();
    const fnOutputs = new Map<string, FnOut>();
    lines.forEach((l, i) => {
      if (l.type !== 'response_item') return;
      const p = l.payload;
      if (!p) return;
      if (p.type === 'function_call' && typeof p.call_id === 'string') {
        if (p.name === 'exec_command') {
          execCalls.set(p.call_id, {
            id: p.call_id, name: p.name, argsRaw: p.arguments ?? '',
            callId: p.call_id, ts: l.timestamp, lineIndex: i,
          });
        }
      } else if (p.type === 'custom_tool_call' && typeof p.call_id === 'string') {
        if (p.name === 'apply_patch') applyPatchCallIds.add(p.call_id);
      } else if (p.type === 'function_call_output' && typeof p.call_id === 'string') {
        fnOutputs.set(p.call_id, {
          callId: p.call_id,
          output: typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? ''),
          ts: l.timestamp,
        });
      } else if (p.type === 'custom_tool_call_output' && typeof p.call_id === 'string') {
        fnOutputs.set(p.call_id, {
          callId: p.call_id,
          output: typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? ''),
          ts: l.timestamp,
        });
      }
    });

    const out: Entry[] = [];
    lines.forEach((l, i) => {
      if (l.type !== 'response_item') return;
      const p = l.payload;
      if (!p) return;
      const ts = shortTime(l.timestamp);
      const baseId = `codex-${i}`;

      if (p.type === 'message') {
        const role = p.role;
        if (role === 'developer') return; // system-prompt injections; skip
        const text = collectText(p.content);
        if (!text || isEnvelopeTag(text)) return;
        if (role === 'user') {
          out.push({ id: baseId, role: 'user', timestamp: ts, text });
        } else if (role === 'assistant') {
          out.push({ id: baseId, role: 'assistant', timestamp: ts, text });
        }
        return;
      }

      if (p.type === 'reasoning') {
        // `encrypted_content` is opaque to us. Only the `summary` array
        // (when populated) carries human-readable thinking.
        const summary = Array.isArray(p.summary) ? p.summary : [];
        const text = summary
          .map((s: unknown) => {
            if (typeof s === 'string') return s;
            if (s && typeof s === 'object' && 'text' in (s as Record<string, unknown>)) {
              return String((s as Record<string, unknown>).text);
            }
            return '';
          })
          .filter(Boolean).join('\n');
        if (text) out.push({ id: baseId, role: 'thinking', timestamp: ts, text });
        return;
      }

      if (p.type === 'function_call') {
        const args = parseFnArgs(p.arguments ?? '');
        if (p.name === 'exec_command') {
          const r = fnOutputs.get(p.call_id);
          const cmd = String(args.cmd ?? args.command ?? '');
          out.push({
            id: baseId, role: 'bash', timestamp: ts,
            cmd, out: r?.output ?? '',
          });
        } else {
          out.push({
            id: baseId, role: 'toolCall', timestamp: ts,
            tool: p.name,
            args,
            preview: JSON.stringify(args).slice(0, 200),
          });
        }
        return;
      }

      if (p.type === 'function_call_output') {
        // Bash outputs already folded; emit a generic toolResult for others.
        if (execCalls.has(p.call_id)) return;
        const text = typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? '');
        const lineCount = text.split('\n').length;
        out.push({
          id: baseId, role: 'toolResult', timestamp: ts,
          ok: true,
          summary: lineCount > 1 ? `${lineCount} lines` : text.slice(0, 120),
        });
        return;
      }

      if (p.type === 'custom_tool_call') {
        if (p.name === 'apply_patch') {
          const input = typeof p.input === 'string' ? p.input : '';
          const files = parseApplyPatch(input);
          if (files.length === 0) {
            // Fall back to a generic toolCall so the entry isn't dropped.
            out.push({
              id: baseId, role: 'toolCall', timestamp: ts,
              tool: 'apply_patch', args: {},
              preview: input.slice(0, 200),
            });
            return;
          }
          files.forEach((f, j) => {
            const eid = files.length === 1 ? baseId : `${baseId}#${j}`;
            if (f.op === 'add') {
              out.push({
                id: eid, role: 'toolCall', timestamp: ts,
                tool: 'Write',
                args: { path: f.path, content: f.content ?? '' },
                preview: f.path,
              });
            } else if (f.op === 'update') {
              const edits = (f.edits ?? []).map((e) => ({
                old_string: e.oldText, new_string: e.newText,
              }));
              out.push({
                id: eid, role: 'toolCall', timestamp: ts,
                tool: 'Edit',
                args: { path: f.path, edits },
                preview: f.path,
              });
            } else {
              out.push({
                id: eid, role: 'toolCall', timestamp: ts,
                tool: 'Delete',
                args: { path: f.path },
                preview: `deleted ${f.path}`,
              });
            }
          });
          return;
        }
        const inputStr = typeof p.input === 'string' ? p.input : JSON.stringify(p.input ?? '');
        out.push({
          id: baseId, role: 'toolCall', timestamp: ts,
          tool: typeof p.name === 'string' ? p.name : 'custom_tool',
          args: {},
          preview: inputStr.slice(0, 200),
        });
        return;
      }

      if (p.type === 'custom_tool_call_output') {
        // apply_patch outputs are implicit in the diff entry; suppress.
        if (applyPatchCallIds.has(p.call_id)) return;
        const text = typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? '');
        const lineCount = text.split('\n').length;
        out.push({
          id: baseId, role: 'toolResult', timestamp: ts,
          ok: true,
          summary: lineCount > 1 ? `${lineCount} lines` : text.slice(0, 120),
        });
        return;
      }
    });
    return out;
  },
};

// ── apply_patch parser ────────────────────────────────────────────────────
//
// Format (envelope may wrap multiple file ops):
//   *** Begin Patch
//   *** Add File: <path>
//   +<line>...
//   *** Update File: <path>
//   *** Move to: <path>   (optional)
//   @@ <optional context header>
//    <context line>
//   -<removed line>
//   +<added line>
//   *** Delete File: <path>
//   *** End Patch
//
// Update hunks are separated by `@@`. We turn each hunk into one
// {oldText, newText} pair so the existing PierreDiff renderer can show it.

interface ApplyPatchFile {
  path: string;
  op: 'add' | 'update' | 'delete';
  content?: string;
  edits?: Array<{ oldText: string; newText: string }>;
  moveTo?: string;
}

function parseApplyPatch(input: string): ApplyPatchFile[] {
  const lines = input.split('\n');
  const out: ApplyPatchFile[] = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    let m: RegExpExecArray | null;
    if ((m = /^\*\*\* Add File: (.+)$/.exec(ln))) {
      const path = m[1];
      i++;
      const body: string[] = [];
      while (i < lines.length && !lines[i].startsWith('*** ')) {
        const l = lines[i];
        body.push(l.startsWith('+') ? l.slice(1) : l);
        i++;
      }
      out.push({ path, op: 'add', content: body.join('\n') });
      continue;
    }
    if ((m = /^\*\*\* Delete File: (.+)$/.exec(ln))) {
      out.push({ path: m[1], op: 'delete' });
      i++;
      continue;
    }
    if ((m = /^\*\*\* Update File: (.+)$/.exec(ln))) {
      const path = m[1];
      i++;
      let moveTo: string | undefined;
      if (i < lines.length) {
        const m2 = /^\*\*\* Move to: (.+)$/.exec(lines[i]);
        if (m2) { moveTo = m2[1]; i++; }
      }
      const edits: Array<{ oldText: string; newText: string }> = [];
      let oldBuf: string[] = [];
      let newBuf: string[] = [];
      const flush = () => {
        if (oldBuf.length || newBuf.length) {
          edits.push({ oldText: oldBuf.join('\n'), newText: newBuf.join('\n') });
        }
        oldBuf = []; newBuf = [];
      };
      while (i < lines.length && !lines[i].startsWith('*** ')) {
        const l = lines[i];
        if (l.startsWith('@@')) {
          flush();
          i++;
          continue;
        }
        if (l.startsWith('+')) {
          newBuf.push(l.slice(1));
        } else if (l.startsWith('-')) {
          oldBuf.push(l.slice(1));
        } else if (l.startsWith(' ')) {
          const c = l.slice(1);
          oldBuf.push(c);
          newBuf.push(c);
        } else if (l === '') {
          // Truly empty line (no leading space) — treat as blank context so
          // we don't desync old/new. Common when patches were re-flowed.
          oldBuf.push('');
          newBuf.push('');
        }
        i++;
      }
      flush();
      out.push({ path, op: 'update', edits, moveTo });
      continue;
    }
    i++;
  }
  return out;
}

function walk(dir: string, visit: (file: string) => void): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, visit);
    else if (e.isFile()) visit(p);
  }
}
