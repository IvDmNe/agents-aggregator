import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { composeSessionId, type Entry, type EntryImage, type Session } from '../../shared/types';
import type { Parser, SessionFile } from './base';

/**
 * OpenCode session format (SQLite, not JSONL).
 *
 *   <root>/opencode.db
 *
 * Tables of interest:
 *   session(id, directory, title, agent, model, time_created, time_updated, …)
 *   message(id, session_id, time_created, data) — data is JSON: { role, time, … }
 *   part(id, message_id, session_id, time_created, data) — data.type drives shape:
 *     text          { text, synthetic?, metadata? }
 *     reasoning     { text }
 *     tool          { tool, callID, state: { status, input, output, … } }
 *     file          { mime, filename, url, source }     — user attachment
 *     patch         { hash, files }                      — snapshot ref, opaque
 *     step-start | step-finish | compaction | subtask  — meta, skipped
 *
 * Since the Parser interface is filePath-based, we encode each session's
 * identity as "<abs db path>#<session id>" and split on the last '#'.
 * The '#' is not allowed in file paths the indexer would otherwise emit.
 */

const SEP = '#';

function dbPathFor(root: string): string {
  return path.join(root, 'opencode.db');
}

function encodeFilePath(dbPath: string, sessionId: string): string {
  return `${dbPath}${SEP}${sessionId}`;
}

function decodeFilePath(fp: string): { dbPath: string; sessionId: string } | null {
  const idx = fp.lastIndexOf(SEP);
  if (idx < 0) return null;
  return { dbPath: fp.slice(0, idx), sessionId: fp.slice(idx + 1) };
}

function openDb(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

interface OcSessionRow {
  id: string;
  directory: string;
  title: string;
  agent: string | null;
  model: string | null;
  time_created: number;
  time_updated: number;
}

interface OcMessageRow {
  id: string;
  time_created: number;
  data: string;
}

interface OcPartRow {
  id: string;
  message_id: string;
  time_created: number;
  data: string;
}

interface OcMessageData {
  role: 'user' | 'assistant' | string;
  modelID?: string;
  providerID?: string;
}

interface OcToolState {
  status?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

interface OcPartText { type: 'text'; text?: string; synthetic?: boolean }
interface OcPartReasoning { type: 'reasoning'; text?: string }
interface OcPartTool { type: 'tool'; tool: string; callID?: string; state?: OcToolState }
interface OcPartFile { type: 'file'; mime?: string; filename?: string; url?: string }
interface OcPartAny { type: string; [k: string]: unknown }

function isoFromMs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

function shortTimeFromMs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  try { return new Date(ms).toISOString().slice(11, 19); } catch { return ''; }
}

function parseModelField(model: string | null): string {
  if (!model) return '';
  try {
    const obj = JSON.parse(model) as { id?: unknown; modelID?: unknown };
    if (typeof obj.id === 'string') return obj.id;
    if (typeof obj.modelID === 'string') return obj.modelID;
  } catch { /* fall through */ }
  return model;
}

function previewFromInput(name: string, input: Record<string, unknown>): string {
  if (name === 'bash') return String(input.command ?? input.cmd ?? '');
  const interesting = ['filePath', 'file_path', 'path', 'pattern', 'query', 'url', 'description'];
  const picked: Record<string, unknown> = {};
  for (const k of interesting) if (k in input) picked[k] = input[k];
  if (Object.keys(picked).length === 0) return JSON.stringify(input).slice(0, 200);
  return JSON.stringify(picked);
}

function outputToString(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  try { return JSON.stringify(output); } catch { return ''; }
}

function imageFromFilePart(p: { mime?: string; url?: string; filename?: string }): EntryImage | null {
  const mime = p.mime ?? '';
  if (!mime.startsWith('image/')) return null;
  const url = p.url ?? '';
  if (url.startsWith('data:')) {
    // data:<mime>;base64,<payload>
    const comma = url.indexOf(',');
    if (comma < 0) return null;
    const meta = url.slice(5, comma);
    const data = url.slice(comma + 1);
    const isB64 = /;base64$/i.test(meta);
    if (!isB64) return null;
    return { mime, data };
  }
  if (url) return { mime, url };
  return null;
}

export const opencodeParser: Parser = {
  agent: 'opencode',

  listSessions(root: string): SessionFile[] {
    const dbPath = dbPathFor(root);
    if (!fs.existsSync(dbPath)) return [];
    const db = openDb(dbPath);
    try {
      const rows = db
        .prepare('SELECT id FROM session ORDER BY time_updated DESC')
        .all() as { id: string }[];
      return rows.map((r) => ({ sessionId: r.id, filePath: encodeFilePath(dbPath, r.id) }));
    } finally {
      db.close();
    }
  },

  parseSession(filePath: string, sourceId: string): Session & { filePath: string } {
    const decoded = decodeFilePath(filePath);
    if (!decoded) throw new Error(`opencode: malformed filePath ${filePath}`);
    const { dbPath, sessionId } = decoded;
    const db = openDb(dbPath);
    try {
      const row = db
        .prepare('SELECT id, directory, title, agent, model, time_created, time_updated FROM session WHERE id = ?')
        .get(sessionId) as OcSessionRow | undefined;
      if (!row) throw new Error(`opencode: session ${sessionId} not found`);
      const messageCount = (db
        .prepare('SELECT COUNT(*) AS c FROM message WHERE session_id = ?')
        .get(sessionId) as { c: number }).c;
      return {
        id: composeSessionId(sourceId, row.id),
        sourceId,
        agent: 'opencode',
        name: row.title || null,
        cwd: row.directory || '',
        model: parseModelField(row.model),
        startedAt: isoFromMs(row.time_created),
        updatedAt: isoFromMs(row.time_updated),
        messageCount,
        costUsd: null,
        live: false,
        branches: 0,
        status: 'idle',
        filePath,
      };
    } finally {
      db.close();
    }
  },

  parseEntries(filePath: string): Entry[] {
    const decoded = decodeFilePath(filePath);
    if (!decoded) return [];
    const { dbPath, sessionId } = decoded;
    if (!fs.existsSync(dbPath)) return [];
    const db = openDb(dbPath);
    try {
      const messages = db
        .prepare('SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created, id')
        .all(sessionId) as OcMessageRow[];
      const parts = db
        .prepare('SELECT id, message_id, time_created, data FROM part WHERE session_id = ? ORDER BY time_created, id')
        .all(sessionId) as OcPartRow[];

      const partsByMsg = new Map<string, OcPartRow[]>();
      for (const p of parts) {
        let arr = partsByMsg.get(p.message_id);
        if (!arr) { arr = []; partsByMsg.set(p.message_id, arr); }
        arr.push(p);
      }

      const out: Entry[] = [];

      for (const m of messages) {
        let md: OcMessageData;
        try { md = JSON.parse(m.data) as OcMessageData; } catch { continue; }
        const role = md.role;
        const mts = shortTimeFromMs(m.time_created);
        const mparts = partsByMsg.get(m.id) ?? [];

        if (role === 'user') {
          let lastUserEntry: Entry | null = null;
          mparts.forEach((p, i) => {
            let pd: OcPartAny;
            try { pd = JSON.parse(p.data) as OcPartAny; } catch { return; }
            const eid = mparts.length === 1 ? m.id : `${m.id}#${i}`;

            if (pd.type === 'text') {
              const tp = pd as OcPartText;
              if (tp.synthetic) return; // editor-context / tool injections
              const text = typeof tp.text === 'string' ? tp.text : '';
              if (!text.trim()) return;
              const entry: Entry = { id: eid, role: 'user', timestamp: mts, text };
              out.push(entry);
              lastUserEntry = entry;
              return;
            }

            if (pd.type === 'file') {
              const fp = pd as OcPartFile;
              const img = imageFromFilePart(fp);
              if (img) {
                if (lastUserEntry) {
                  (lastUserEntry.images ??= []).push(img);
                } else {
                  const entry: Entry = { id: eid, role: 'user', timestamp: mts, images: [img] };
                  out.push(entry);
                  lastUserEntry = entry;
                }
                return;
              }
              const fname = fp.filename ?? fp.url ?? '';
              if (!fname) return;
              const entry: Entry = { id: eid, role: 'user', timestamp: mts, text: `@${fname}` };
              out.push(entry);
              lastUserEntry = entry;
            }
          });
          continue;
        }

        if (role === 'assistant') {
          mparts.forEach((p, i) => {
            let pd: OcPartAny;
            try { pd = JSON.parse(p.data) as OcPartAny; } catch { return; }
            const eid = mparts.length === 1 ? m.id : `${m.id}#${i}`;
            const pts = shortTimeFromMs(p.time_created);

            if (pd.type === 'text') {
              const text = (pd as OcPartText).text;
              if (text) out.push({ id: eid, role: 'assistant', timestamp: pts, text });
              return;
            }
            if (pd.type === 'reasoning') {
              const text = (pd as OcPartReasoning).text;
              if (text) out.push({ id: eid, role: 'thinking', timestamp: pts, text });
              return;
            }
            if (pd.type === 'tool') {
              const tp = pd as unknown as OcPartTool;
              const state = tp.state ?? {};
              const input = (state.input ?? {}) as Record<string, unknown>;
              const output = outputToString(state.output);

              if (tp.tool === 'bash') {
                const cmd = String(input.command ?? input.cmd ?? '');
                out.push({ id: eid, role: 'bash', timestamp: pts, cmd, out: output });
                return;
              }

              const argPath =
                typeof input.filePath === 'string' ? (input.filePath as string)
                : typeof input.file_path === 'string' ? (input.file_path as string)
                : typeof input.path === 'string' ? (input.path as string)
                : undefined;
              out.push({
                id: eid, role: 'toolCall', timestamp: pts,
                tool: tp.tool,
                args: { path: argPath, ...input },
                preview: previewFromInput(tp.tool, input),
              });
              if (output) {
                const lineCount = output.split('\n').length;
                out.push({
                  id: `${eid}#out`, role: 'toolResult', timestamp: pts,
                  tool: tp.tool,
                  ok: state.status !== 'error',
                  summary: lineCount > 1 ? `${lineCount} lines` : output.slice(0, 120),
                });
              }
              return;
            }
            // step-start, step-finish, patch, file, compaction, subtask — skip
          });
          continue;
        }
      }
      return out;
    } finally {
      db.close();
    }
  },
};
