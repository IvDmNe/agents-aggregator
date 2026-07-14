# Live Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live Kanban board that groups recent/active agent sessions into four status columns (Running · Needs Input · Needs Approval · Done/Idle) and updates live.

**Architecture:** A pure status engine classifies each session from `(ageSec, lastKind, paneAlive)`. Parsers compute `lastKind`/`lastLine` for each session; these persist in SQLite. A new `/api/board` route filters to recent+live sessions, computes tmux process-liveness once per request, and returns classified board entries. A React `BoardView` renders four columns, refreshing on SSE events plus a 5s poll.

**Tech Stack:** Node + TypeScript, Hono (server), better-sqlite3, React + Vite + TanStack Router (UI). Tests use Node's built-in test runner (`node:test`) via `tsx`.

## Global Constraints

- Node.js >= 18 (repo runs on Node 22). No new runtime dependencies.
- Session-table columns use **camelCase** names (e.g. `updatedAt`, `messageCount`) — match this when adding columns.
- Wire responses must **not** include `filePath` (kept server-side only; see `/api/sessions`).
- `Date.now()` is allowed in server/test code (this is not a workflow script).
- Column type values are exactly: `'running' | 'needs-input' | 'needs-approval' | 'done'`.
- `lastKind` values are exactly: `'tool_pending' | 'turn_done' | 'working' | 'unknown'`.
- Tunable constants live only in `src/server/status.ts`: `RUNNING_SEC = 10`, `STALL_MAX_SEC = 900`.

---

### Task 1: Status engine (pure) + test harness

**Files:**
- Modify: `package.json` (add `test` script)
- Modify: `src/shared/types.ts` (add `LastKind`, `BoardColumn`, `BoardEntry`; extend `Session`)
- Create: `src/server/status.ts`
- Test: `src/server/status.test.ts`

**Interfaces:**
- Produces: `type LastKind`, `type BoardColumn`, `interface BoardEntry` (in `shared/types.ts`); `deriveColumn(i: ColumnInput): BoardColumn`, `interface ColumnInput { ageSec: number; lastKind: LastKind; paneAlive: boolean }`, and constants `RUNNING_SEC`, `STALL_MAX_SEC` (in `status.ts`).

- [ ] **Step 1: Add the test script to package.json**

In `package.json`, add to the `"scripts"` block (after `"typecheck"`):

```json
    "test": "node --import tsx --test 'src/**/*.test.ts'",
```

- [ ] **Step 2: Add shared types**

In `src/shared/types.ts`, immediately after the `Session` interface (ends at the line with `status: 'streaming' | 'tool' | 'idle' | string;` then `}`), add:

```typescript
export type LastKind = 'tool_pending' | 'turn_done' | 'working' | 'unknown';
export type BoardColumn = 'running' | 'needs-input' | 'needs-approval' | 'done';

export interface BoardEntry {
  session: Session;
  column: BoardColumn;
  lastLine: string;
  live: boolean;
}
```

Then extend the `Session` interface: add these two optional fields just before its closing `}` (after the `status:` line):

```typescript
  lastKind?: LastKind;
  lastLine?: string;
```

- [ ] **Step 3: Write the failing test**

Create `src/server/status.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./status`.

- [ ] **Step 5: Write the status engine**

Create `src/server/status.ts`:

```typescript
import type { BoardColumn, LastKind } from '../shared/types';

/** Session is "running" if it wrote within this many seconds. */
export const RUNNING_SEC = 10;
/** Beyond this age, a session is "done" unless its process is still alive. */
export const STALL_MAX_SEC = 900;

export interface ColumnInput {
  /** Seconds since the session file was last updated. */
  ageSec: number;
  /** Shape of the last meaningful entry. */
  lastKind: LastKind;
  /** True if an agent process for this session is alive in a tmux pane. */
  paneAlive: boolean;
}

/**
 * Classify a session into a board column. Pure; first match wins.
 *
 * Rationale for needs-approval: an unanswered tool call on a still-alive (or
 * only-recently-stalled) process is most likely blocked on a permission prompt.
 */
export function deriveColumn(i: ColumnInput): BoardColumn {
  if (i.ageSec < RUNNING_SEC) return 'running';
  const within = i.ageSec < STALL_MAX_SEC;
  const active = i.paneAlive || within;
  if (i.lastKind === 'tool_pending' && active) return 'needs-approval';
  if (i.lastKind === 'turn_done' && active) return 'needs-input';
  return 'done';
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all 7 tests in `status.test.ts` pass.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json src/shared/types.ts src/server/status.ts src/server/status.test.ts
git commit -m "feat(board): pure status engine + test harness"
```

---

### Task 2: `lastKind`/`lastLine` extraction in the Claude parser

**Files:**
- Modify: `src/server/parsers/claude.ts`
- Test: `src/server/parsers/claude.test.ts`

**Interfaces:**
- Consumes: `LastKind` from `shared/types`; existing `ClaudeLine`, `ClaudeMessageLine`, `ClaudeContentBlock`, `tcToString` in `claude.ts`.
- Produces: `deriveLastActivity(lines: ClaudeLine[]): { kind: LastKind; line: string }` (exported from `claude.ts`); `parseSession` now sets `lastKind` and `lastLine` on its return value.

- [ ] **Step 1: Write the failing test**

Create `src/server/parsers/claude.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLastActivity } from './claude';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `deriveLastActivity` is not exported.

- [ ] **Step 3: Implement `deriveLastActivity`**

In `src/server/parsers/claude.ts`, add the import of `LastKind` to the existing type import on line 3:

```typescript
import { composeSessionId, type Entry, type EntryImage, type LastKind, type Session } from '../../shared/types';
```

Then add this exported function directly above `parseSession` (before the `parseSession(filePath...` method — note `parseSession` is a method inside the exported parser object, so place `deriveLastActivity` as a standalone top-level function, e.g. right after the `readJsonl` function near line 65):

```typescript
export function deriveLastActivity(lines: ClaudeLine[]): { kind: LastKind; line: string } {
  let last: ClaudeMessageLine | null = null;
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();
  for (const l of lines) {
    if (l.type !== 'user' && l.type !== 'assistant') continue;
    const m = l as ClaudeMessageLine;
    if (m.isSidechain) continue;
    last = m;
    const content = m.message?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'tool_use') toolUseIds.add(b.id);
        else if (b.type === 'tool_result') toolResultIds.add(b.tool_use_id);
      }
    }
  }
  if (!last) return { kind: 'unknown', line: '' };
  let pending = false;
  for (const id of toolUseIds) if (!toolResultIds.has(id)) { pending = true; break; }
  const text = tcToString(last.message?.content).replace(/\s+/g, ' ').trim().slice(0, 200);
  if (last.type === 'assistant') {
    if (pending) return { kind: 'tool_pending', line: text || '(tool call)' };
    return { kind: 'turn_done', line: text };
  }
  return { kind: 'working', line: text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `claude.test.ts` tests pass (and `status.test.ts` still passes).

- [ ] **Step 5: Wire it into `parseSession`**

In `src/server/parsers/claude.ts`, inside `parseSession`, after the line `const sessionId = path.basename(filePath, '.jsonl');` add:

```typescript
    const activity = deriveLastActivity(lines);
```

Then in the returned object (the `return { ... }` in `parseSession`), add these two fields after `status: 'idle',`:

```typescript
      lastKind: activity.kind,
      lastLine: activity.line,
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/parsers/claude.ts src/server/parsers/claude.test.ts
git commit -m "feat(board): derive lastKind/lastLine in claude parser"
```

---

### Task 3: Persist `lastKind`/`lastLine` (DB migration + mapping + indexer)

**Files:**
- Modify: `src/server/db.ts`
- Modify: `src/server/indexer.ts`
- Test: `src/server/db.test.ts`

**Interfaces:**
- Consumes: `Session.lastKind`, `Session.lastLine` (Task 1).
- Produces: `SessionRow` gains `lastKind: string | null` and `lastLine: string | null`; `applyMigrations(db)` exported; `rowToSession` maps the new columns (null → `'unknown'` / `''`).

- [ ] **Step 1: Write the failing test**

Create `src/server/db.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { applyMigrations } from './db';

function oldSchema(db: Database.Database): void {
  db.exec(`CREATE TABLE session (
    sourceId TEXT NOT NULL, sessionId TEXT NOT NULL, agent TEXT NOT NULL,
    filePath TEXT NOT NULL, cwd TEXT, name TEXT, model TEXT,
    startedAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
    messageCount INTEGER NOT NULL DEFAULT 0, costUsd REAL,
    branches INTEGER NOT NULL DEFAULT 0, live INTEGER NOT NULL DEFAULT 0,
    status TEXT, PRIMARY KEY (sourceId, sessionId));`);
}

function columnNames(db: Database.Database): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(session)`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

test('applyMigrations adds lastKind/lastLine to an old table', () => {
  const db = new Database(':memory:');
  oldSchema(db);
  applyMigrations(db);
  const cols = columnNames(db);
  assert.ok(cols.has('lastKind'));
  assert.ok(cols.has('lastLine'));
});

test('applyMigrations is idempotent', () => {
  const db = new Database(':memory:');
  oldSchema(db);
  applyMigrations(db);
  assert.doesNotThrow(() => applyMigrations(db));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `applyMigrations` is not exported.

- [ ] **Step 3: Add columns to the schema and the migration**

In `src/server/db.ts`, in the `session` `CREATE TABLE` block, add the two columns right after `status        TEXT,` (before `PRIMARY KEY`):

```sql
      lastKind      TEXT,
      lastLine      TEXT,
```

Add this exported function immediately after `initSchema` (after its closing `}`):

```typescript
export function applyMigrations(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(session)`).all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('lastKind')) db.exec(`ALTER TABLE session ADD COLUMN lastKind TEXT`);
  if (!names.has('lastLine')) db.exec(`ALTER TABLE session ADD COLUMN lastLine TEXT`);
}
```

In `getDb()`, call it right after `initSchema(_db);`:

```typescript
  initSchema(_db);
  applyMigrations(_db);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — both `db.test.ts` tests pass.

- [ ] **Step 5: Extend `SessionRow`, upsert, and mapping**

In `src/server/db.ts`, in `interface SessionRow`, add after `status: string | null;`:

```typescript
  lastKind: string | null;
  lastLine: string | null;
```

In `rowToSession`, add after `status: r.status ?? 'idle',`:

```typescript
    lastKind: (r.lastKind ?? 'unknown') as Session['lastKind'],
    lastLine: r.lastLine ?? '',
```

In `sessionsRepo.upsert`, update the SQL: add `lastKind,lastLine` to the column list and `@lastKind,@lastLine` to the VALUES list, and add to the `DO UPDATE SET` clause:

```sql
           lastKind=excluded.lastKind, lastLine=excluded.lastLine
```

The full upsert statement becomes:

```typescript
        `INSERT INTO session(sourceId,sessionId,agent,filePath,cwd,name,model,
                             startedAt,updatedAt,messageCount,costUsd,branches,live,status,lastKind,lastLine)
         VALUES (@sourceId,@sessionId,@agent,@filePath,@cwd,@name,@model,
                 @startedAt,@updatedAt,@messageCount,@costUsd,@branches,@live,@status,@lastKind,@lastLine)
         ON CONFLICT(sourceId,sessionId) DO UPDATE SET
           agent=excluded.agent, filePath=excluded.filePath, cwd=excluded.cwd,
           name=excluded.name, model=excluded.model, startedAt=excluded.startedAt,
           updatedAt=excluded.updatedAt, messageCount=excluded.messageCount,
           costUsd=excluded.costUsd, branches=excluded.branches,
           live=excluded.live, status=excluded.status,
           lastKind=excluded.lastKind, lastLine=excluded.lastLine`,
```

- [ ] **Step 6: Pass the new fields through the indexer**

In `src/server/indexer.ts`, in `indexSource` the `row: SessionRow = { ... }` object, add after `status: meta.status,`:

```typescript
        lastKind: meta.lastKind ?? null,
        lastLine: meta.lastLine ?? null,
```

In `reindexFile`, in the `sessionsRepo.upsert({ ... })` object, add after `status: 'streaming',`:

```typescript
      lastKind: meta.lastKind ?? null,
      lastLine: meta.lastLine ?? null,
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/db.ts src/server/db.test.ts src/server/indexer.ts
git commit -m "feat(board): persist lastKind/lastLine (migration + mapping)"
```

---

### Task 4: Board assembly + `/api/board` route + tmux liveness

**Files:**
- Modify: `src/server/tmux.ts`
- Create: `src/server/board.ts`
- Modify: `src/server/api.ts`
- Test: `src/server/board.test.ts`

**Interfaces:**
- Consumes: `deriveColumn` (Task 1), `Session`/`BoardEntry` (Task 1), `listPanes`/`findDescendantMatching`/`readProcCwd`/`AGENT_BINARIES` (existing in `tmux.ts`).
- Produces: `livePaneKeys(): Set<string>` (in `tmux.ts`); `buildBoard(sessions, isAlive, nowMs, windowH): BoardEntry[]` (in `board.ts`); `GET /api/board?windowH=<n>` returning `{ entries: BoardEntry[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/server/board.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBoard } from './board';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./board`.

- [ ] **Step 3: Implement `buildBoard`**

Create `src/server/board.ts`:

```typescript
import { deriveColumn } from './status';
import type { BoardEntry, LastKind, Session } from '../shared/types';

/**
 * Filter to recent+live sessions and classify each into a board column.
 * Pure: caller supplies `isAlive` (tmux liveness) and `nowMs` so this is
 * fully testable.
 */
export function buildBoard(
  sessions: Session[],
  isAlive: (agent: string, cwd: string) => boolean,
  nowMs: number,
  windowH: number,
): BoardEntry[] {
  const windowMs = windowH * 3600 * 1000;
  const out: BoardEntry[] = [];
  for (const s of sessions) {
    const ageMs = nowMs - Date.parse(s.updatedAt);
    if (!s.live && !(ageMs < windowMs)) continue;
    const paneAlive = !!s.cwd && isAlive(s.agent, s.cwd);
    const column = deriveColumn({
      ageSec: ageMs / 1000,
      lastKind: (s.lastKind ?? 'unknown') as LastKind,
      paneAlive,
    });
    out.push({ session: s, column, lastLine: s.lastLine ?? '', live: s.live });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `board.test.ts` tests pass.

- [ ] **Step 5: Add `livePaneKeys` to tmux.ts**

In `src/server/tmux.ts`, add at the end of the file:

```typescript
/**
 * Set of `${agent}\0${resolvedCwd}` keys for every tmux pane currently running
 * a known agent. One `listPanes()` + process-tree walk; used by the board to
 * decide `paneAlive` for all sessions in a single pass.
 */
export function livePaneKeys(): Set<string> {
  const keys = new Set<string>();
  const agents = Object.keys(AGENT_BINARIES) as AgentType[];
  for (const pane of listPanes()) {
    for (const agent of agents) {
      const pid = findDescendantMatching(pane.panePid, AGENT_BINARIES[agent]);
      if (!pid) continue;
      const cwd = readProcCwd(pid);
      if (cwd) keys.add(`${agent} ${path.resolve(cwd)}`);
    }
  }
  return keys;
}
```

(`path`, `AGENT_BINARIES`, `AgentType`, `listPanes`, `findDescendantMatching`, `readProcCwd` are all already imported/defined in `tmux.ts`.)

- [ ] **Step 6: Add the `/api/board` route**

In `src/server/api.ts`, add `livePaneKeys` to the existing tmux import on line 11:

```typescript
import { livePaneKeys, resolveTargetForSession, sendInput } from './tmux';
```

Add `import path from 'node:path';` — note `path` is already imported on line 3, so skip if present. Add the `buildBoard` import after the `distill` import:

```typescript
import { buildBoard } from './board';
```

Then add this route immediately after the `app.get('/api/sessions', ...)` handler (after its closing `});`):

```typescript
app.get('/api/board', (c) => {
  const url = new URL(c.req.url);
  const windowH = Number(url.searchParams.get('windowH') ?? '6') || 6;
  const rows = sessionsRepo.list();
  const sessions = rows.map(({ filePath: _fp, ...rest }) => rest);
  const keys = livePaneKeys();
  const isAlive = (agent: string, cwd: string) =>
    keys.has(`${agent} ${path.resolve(cwd)}`);
  const entries = buildBoard(sessions, isAlive, Date.now(), windowH);
  return c.json({ entries });
});
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual smoke test the endpoint**

Run (server must be built + running on 3737, or run `npm run cli -- serve --port 3799` in another shell):

```bash
curl -s 'http://localhost:3799/api/board?windowH=24' | head -c 400
```
Expected: JSON `{"entries":[...]}`; each entry has `column` ∈ {running,needs-input,needs-approval,done}, `lastLine`, `live`, and a `session` object with no `filePath`.

- [ ] **Step 9: Commit**

```bash
git add src/server/tmux.ts src/server/board.ts src/server/board.test.ts src/server/api.ts
git commit -m "feat(board): /api/board route + tmux liveness"
```

---

### Task 5: Board API client hook

**Files:**
- Modify: `src/ui/api.ts`

**Interfaces:**
- Consumes: `BoardEntry` from `shared/types`; existing `fetchJson`, `useEventStream` in `api.ts`.
- Produces: `useBoard(windowH: number, refreshKey: number): { data: BoardEntry[]; error: Error | null }`. Reuses existing `sendSessionInput` for quick-send.

- [ ] **Step 1: Add the `BoardEntry` import and `useBoard` hook**

In `src/ui/api.ts`, add `BoardEntry` to the type import on line 2:

```typescript
import { splitSessionId, type BoardEntry, type Entry, type Session, type Source } from '../shared/types';
```

Add near the other response interfaces (after `ProjectsResponse`):

```typescript
export interface BoardResponse { entries: BoardEntry[]; }
```

Add this hook after `useSessions` (before `useProjects`):

```typescript
/**
 * Fetch the Kanban board and keep it fresh. Polls every 5s because a
 * Running→Needs-Input transition is driven by the *absence* of new activity,
 * which the SSE stream cannot push. `refreshKey` lets callers force an
 * immediate refetch (e.g. on an SSE event).
 */
export function useBoard(windowH: number, refreshKey: number): { data: BoardEntry[]; error: Error | null } {
  const [data, setData] = useState<BoardEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchJson<BoardResponse>(`/api/board?windowH=${windowH}`)
        .then((r) => { if (!cancelled) setData(r.entries); })
        .catch((e) => { if (!cancelled && (e as Error).name !== 'AbortError') setError(e as Error); });
    };
    load();
    const iv = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [windowH, refreshKey]);
  return { data, error };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/api.ts
git commit -m "feat(board): useBoard client hook"
```

---

### Task 6: BoardView + BoardCard + route + nav

**Files:**
- Create: `src/ui/components/BoardCard.tsx`
- Create: `src/ui/components/BoardView.tsx`
- Modify: `src/ui/router.tsx`
- Modify: `src/ui/components/TopBar.tsx`

**Interfaces:**
- Consumes: `useBoard`, `useEventStream`, `sendSessionInput` (from `ui/api.ts`); `BoardEntry`, `BoardColumn` (from `shared/types`); `themes` (from `ui/theme`); `Link` (from `@tanstack/react-router`).
- Produces: `/board` route; a "Board" link in `TopBar`.

- [ ] **Step 1: Create BoardCard**

Create `src/ui/components/BoardCard.tsx`:

```typescript
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { sendSessionInput } from '../api';
import { themes, type ThemeMode } from '../theme';
import type { BoardEntry } from '../../shared/types';

function basename(p: string): string {
  if (!p) return '(no cwd)';
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

export function BoardCard({ entry, theme }: { entry: BoardEntry; theme: ThemeMode }) {
  const t = themes[theme];
  const s = entry.session;
  const canSend = entry.column === 'needs-input' || entry.column === 'needs-approval';
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true); setErr(null);
    try { await sendSessionInput(s.id, text); setText(''); }
    catch (e) { setErr((e as Error).message); }
    finally { setSending(false); }
  };

  return (
    <div style={{
      border: `1px solid ${t.border}`, borderRadius: 8, background: t.panel,
      padding: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <Link to="/session/$id" params={{ id: s.id }} style={{ textDecoration: 'none', color: t.fg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
          {entry.live && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5EE0B4' }} />}
          <span style={{ color: t.fg2 }}>{s.agent}</span>
          <span style={{ color: t.dim }}>·</span>
          <span>{basename(s.cwd)}</span>
        </div>
        {s.name && <div style={{ fontSize: 12, color: t.fg2, marginTop: 2 }}>{s.name}</div>}
        {entry.lastLine && (
          <div style={{ fontSize: 11, color: t.dim, marginTop: 3, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.lastLine}
          </div>
        )}
      </Link>
      {canSend && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
            placeholder="Send input…"
            style={{ flex: 1, minWidth: 0, fontSize: 11, padding: '4px 6px',
                     background: t.panel2, border: `1px solid ${t.border}`, borderRadius: 5,
                     color: t.fg, outline: 'none' }}
          />
          <button onClick={() => void send()} disabled={sending}
                  style={{ fontSize: 11, padding: '4px 8px', border: `1px solid ${t.border}`,
                           borderRadius: 5, background: 'transparent', color: t.fg2, cursor: 'pointer' }}>
            ⏎
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: 10, color: '#E5484D' }}>{err}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create BoardView**

Create `src/ui/components/BoardView.tsx`:

```typescript
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useBoard, useEventStream } from '../api';
import { themes, type ThemeMode } from '../theme';
import type { BoardColumn } from '../../shared/types';
import { BoardCard } from './BoardCard';

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'running', label: 'Running' },
  { key: 'needs-input', label: 'Needs Input' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'done', label: 'Done / Idle' },
];

const WINDOWS: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: 'Live-only', hours: 0 },
];

function useThemeMode(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function BoardView() {
  const theme = useThemeMode();
  const t = themes[theme];
  const [windowH, setWindowH] = useState(6);
  const [refreshKey, setRefreshKey] = useState(0);
  useEventStream(() => setRefreshKey((k) => k + 1));
  const { data, error } = useBoard(windowH, refreshKey);

  const byColumn = (col: BoardColumn) => data.filter((e) => e.column === col);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: t.bg, color: t.fg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: `1px solid ${t.border}` }}>
        <Link to="/" style={{ color: t.fg2, textDecoration: 'none', fontSize: 13 }}>← Home</Link>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Board</span>
        <div style={{ flex: 1 }} />
        {WINDOWS.map((w) => (
          <button key={w.label} onClick={() => setWindowH(w.hours)}
                  style={{ fontSize: 12, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                           border: `1px solid ${t.border}`,
                           background: windowH === w.hours ? t.panel2 : 'transparent',
                           color: windowH === w.hours ? t.fg : t.dim }}>
            {w.label}
          </button>
        ))}
      </div>
      {error && <div style={{ padding: 12, color: '#E5484D', fontSize: 12 }}>{error.message}</div>}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 12, padding: 12, overflow: 'hidden' }}>
        {COLUMNS.map((col) => {
          const items = byColumn(col.key);
          return (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.fg2, marginBottom: 8,
                            display: 'flex', gap: 6 }}>
                <span>{col.label}</span>
                <span style={{ color: t.dim }}>{items.length}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {items.map((e) => <BoardCard key={e.session.id} entry={e} theme={theme} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the `/board` route**

In `src/ui/router.tsx`, add the import after the `AppShell` import:

```typescript
import { BoardView } from './components/BoardView';
```

Add the route after `sessionRoute`:

```typescript
export const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/board',
  component: () => <BoardView />,
});
```

Update `routeTree`:

```typescript
const routeTree = rootRoute.addChildren([indexRoute, sessionRoute, boardRoute]);
```

- [ ] **Step 4: Add a "Board" link to the TopBar**

In `src/ui/components/TopBar.tsx`, add at the top:

```typescript
import { Link } from '@tanstack/react-router';
```

Add a Board link using the existing `btnStyle`. Place it right after the search box container closes and before the theme/tweaks buttons (search for where `btnStyle` buttons are rendered; add this as the first such button):

```tsx
      <Link to="/board" style={{ ...btnStyle, textDecoration: 'none' }}>Board</Link>
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed, no errors.

- [ ] **Step 6: Manual QA**

1. Start the server: `npm run cli -- serve --port 3799` (or use the running 3737 instance after rebuild).
2. Open `http://localhost:3799`, click **Board** in the top bar → the 4-column board renders.
3. Start a Claude session in a fresh dir: `agt claude ~/some/project`, send it a prompt.
   - Within ~5s it appears in **Running** (or **Needs Input** once the turn completes).
4. Let the turn finish and go quiet → within one poll (5s) the card moves to **Needs Input**.
5. In the Needs-Input card, type into the inline box and press ⏎ → text is delivered to the tmux pane (verify in the agent's terminal). If the session isn't in tmux, the card shows the 409 "no pane" message.
6. Switch the window selector (1h/6h/24h/Live-only) → the set of cards changes accordingly.
7. Click a card body → navigates to that session's detail view.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/BoardCard.tsx src/ui/components/BoardView.tsx src/ui/router.tsx src/ui/components/TopBar.tsx
git commit -m "feat(board): BoardView + BoardCard + route + nav link"
```

---

## Self-Review

- **Spec coverage:**
  - 4-column model → Task 1 (`BoardColumn`), Task 6 (`COLUMNS`). ✓
  - Status engine (recency + lastKind + paneAlive) → Task 1 (`deriveColumn`). ✓
  - lastKind/lastLine extraction (claude real, others unknown) → Task 2 (claude); codex/pi/opencode leave `lastKind` undefined → mapped to `'unknown'` in Task 3 `rowToSession`. ✓
  - DB persistence + migration → Task 3. ✓
  - `/api/board?windowH` recent+live scope + paneAlive once/request → Task 4. ✓
  - Live updates (SSE + 5s poll) → Task 5 (`useBoard` poll) + Task 6 (`useEventStream` refreshKey). ✓
  - Cards: open detail, quick-send, live pip + last line → Task 6 (`BoardCard`). ✓
  - Nav + route → Task 6. ✓
  - Tests (engine table-driven, lastKind fixtures) → Tasks 1, 2; buildBoard + migration tests → Tasks 3, 4. ✓
  - Dropped jump-to-tmux (YAGNI) → not present. ✓
- **Placeholder scan:** no TBD/TODO; every code step has full code. ✓
- **Type consistency:** `LastKind`/`BoardColumn`/`BoardEntry` defined in Task 1, consumed identically in Tasks 3–6; `deriveColumn`/`buildBoard`/`livePaneKeys`/`useBoard` signatures match across producer/consumer blocks. ✓

## Notes for the implementer

- **codex/pi/opencode parsers** are intentionally *not* modified: they never set `lastKind`, so it persists as NULL and maps to `'unknown'`, which the engine keeps out of the needs-* columns (they land in running-by-recency or done). A future task can add real detection per agent.
- The board recomputes `column` on every request (status is time-dependent); never cache it server-side.
- `livePaneKeys()` walks `/proc`, so it only runs on the small board request, not per session in the list view.
