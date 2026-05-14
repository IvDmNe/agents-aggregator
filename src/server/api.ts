import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sessionsRepo, sourcesRepo } from './db';
import { parserFor } from './parsers';
import { subscribe } from './pubsub';
import { resolveTargetForSession, sendInput } from './tmux';
import { log } from './logger';
import type { AgentType } from '../shared/types';

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB

export const app = new Hono();

app.get('/api/sources', (c) => {
  const url = new URL(c.req.url);
  const project = url.searchParams.get('project');
  const q = url.searchParams.get('q');
  const counts = sessionsRepo.countsBySource({ project, q });
  const sources = sourcesRepo.list().map((s) => ({ ...s, count: counts[s.id] ?? 0 }));
  return c.json({ sources });
});

app.get('/api/sessions', (c) => {
  const url = new URL(c.req.url);
  const sourceId = url.searchParams.get('source');
  const agent = url.searchParams.get('agent');
  const q = url.searchParams.get('q');
  const project = url.searchParams.get('project');
  const rows = sessionsRepo.list({ sourceId, agent, q, project });
  // Strip filePath from the wire — keep it for entry endpoints only.
  const sessions = rows.map(({ filePath: _fp, ...rest }) => rest);
  return c.json({ sessions });
});

app.get('/api/projects', (c) => {
  const url = new URL(c.req.url);
  const sourceId = url.searchParams.get('source');
  const q = url.searchParams.get('q');
  return c.json({ projects: sessionsRepo.projects({ sourceId, q }) });
});

app.get('/api/sessions/:sourceId/:sessionId', (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  return c.json({ session: { ...session, filePath: undefined } });
});

app.get('/api/sessions/:sourceId/:sessionId/entries', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'not found' }, 404);
  const sources = sourcesRepo.list();
  const src = sources.find((s) => s.id === sourceId);
  if (!src) return c.json({ error: 'source missing' }, 404);
  const parser = parserFor(src.agent);
  if (!parser) return c.json({ error: 'no parser' }, 501);
  const entries = await parser.parseEntries(session.filePath);
  return c.json({ entries });
});

app.get('/api/sessions/:sourceId/:sessionId/file', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'session not found' }, 404);

  const url = new URL(c.req.url);
  const requested = url.searchParams.get('path');
  if (!requested) return c.json({ error: 'path required' }, 400);
  if (!session.cwd) return c.json({ error: 'session has no cwd' }, 400);

  // Resolve target path: absolute is used as-is; relative is joined with cwd.
  const target = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(session.cwd, requested);

  // Confine to cwd. Use realpath to follow symlinks on both sides — if the
  // target doesn't exist, fall back to the lexical path for the 404 reply.
  let realTarget: string;
  let realRoot: string;
  try {
    realRoot = await fs.realpath(session.cwd);
  } catch {
    return c.json({ error: 'cwd missing' }, 404);
  }
  try {
    realTarget = await fs.realpath(target);
  } catch {
    return c.json({ error: 'file not found', path: target }, 404);
  }
  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return c.json({ error: 'path escapes session cwd' }, 403);
  }

  let stat;
  try { stat = await fs.stat(realTarget); }
  catch { return c.json({ error: 'file not found', path: target }, 404); }
  if (!stat.isFile()) return c.json({ error: 'not a regular file' }, 400);
  if (stat.size > MAX_FILE_BYTES) {
    return c.json({ error: 'file too large', size: stat.size, limit: MAX_FILE_BYTES }, 413);
  }

  let buf: Buffer;
  try { buf = await fs.readFile(realTarget); }
  catch (e) { return c.json({ error: 'read failed', detail: (e as Error).message }, 500); }

  // Reject binary content — quick heuristic: any NUL byte in the first 8 KB.
  const probe = buf.subarray(0, Math.min(buf.length, 8192));
  if (probe.includes(0)) return c.json({ error: 'binary file' }, 415);

  return c.json({
    path: realTarget,
    relative: rel || path.basename(realTarget),
    size: stat.size,
    mtime: stat.mtimeMs,
    content: buf.toString('utf8'),
  });
});

app.post('/api/sessions/:sourceId/:sessionId/input', async (c) => {
  const sourceId = c.req.param('sourceId');
  const sessionId = c.req.param('sessionId');
  const session = sessionsRepo.find(sourceId, sessionId);
  if (!session) return c.json({ error: 'session not found' }, 404);

  let body: { text?: unknown };
  try { body = await c.req.json(); } catch { body = {}; }
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.length === 0) return c.json({ error: 'text required' }, 400);

  const resolved = resolveTargetForSession({
    agent: session.agent as AgentType,
    cwd: session.cwd,
  });
  if (!resolved) {
    return c.json({
      error: 'no matching tmux pane',
      detail: 'No tmux pane found running this agent with a matching cwd. The session may not be attached to a multiplexer, or the agent process has exited.',
    }, 409);
  }

  try {
    await sendInput(resolved.target, text);
  } catch (e) {
    log.error({ err: e, target: resolved.target }, 'tmux send-keys failed');
    return c.json({ error: 'send failed', detail: (e as Error).message }, 500);
  }
  return c.json({ ok: true, target: resolved.target });
});

app.get('/api/events', (c) => {
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true });

    // Heartbeat so proxies don't drop the connection.
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: 'ping', data: '1' });
    }, 15_000);

    try {
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ ok: true }) });
      for await (const ev of subscribe(ac.signal)) {
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      }
    } finally {
      clearInterval(heartbeat);
    }
  });
});
