# Live Kanban Board — Design

**Date:** 2026-07-14
**Status:** Approved (pending implementation plan)

## Summary

Add a live Kanban board to agents-aggregator that groups recent/active agent
sessions into four status columns — **Running · Needs Input · Needs Approval ·
Done/Idle** — and updates live as agents run. Inspired by CrewView's board, but
with *real* status detection (CrewView's Needs-Approval/Needs-Input columns are
populated by mock data; its real Claude adapter only computes `running` vs
`completed` from file recency).

We can do better because agents-aggregator already has a tmux/process-liveness
signal (from the send-input feature). Combining "is the agent process alive?"
with "what is the shape of the last session entry?" yields genuinely reliable
status.

## Goals

- A `/board` view showing recent + live sessions in 4 status columns.
- Real, best-effort status derivation from session files + process liveness.
- Live updates (SSE + short poll).
- Cards: open session detail, quick-send input, live status pip + last line.

## Non-Goals (YAGNI)

- Jump-to-tmux button (dropped).
- Showing all 651 sessions on the board (recent + live only).
- Workflow builder / scheduling (CrewView has it; out of scope).
- Perfect Needs-Approval detection (impossible from JSONL alone; best-effort).

## Column Model

Four columns: **Running**, **Needs Input**, **Needs Approval**, **Done/Idle**.

## Architecture

```
parsers.parseSession → { ..., lastKind, lastLine }  →  DB (last_kind, last_line)
                                                        │
GET /api/board?windowH=6 ── status engine ─────────────┤ live + recency + lastKind + paneAlive
                                                        ▼
                              [{ session, column, lastLine, live }]
                                                        │
BoardView (SSE + 5s poll) → 4 columns of BoardCard
```

### 1. Status engine — `src/server/status.ts` (NEW)

A **pure** function that classifies one session into a column.

Inputs per session:
- `updatedAt` (→ `ageSec = now - updatedAt`)
- `lastKind`: `tool_pending | turn_done | working | unknown`
- `paneAlive`: boolean — is a tmux pane running this agent at this cwd
  (computed via a single `listPanes()` per request, reusing `tmux.ts`)

Rules (first match wins):

1. `ageSec < RUNNING_SEC` → **running**
2. `lastKind === 'tool_pending'` and (`paneAlive` or `ageSec < STALL_MAX_SEC`) → **needs-approval**
3. `lastKind === 'turn_done'` and (`paneAlive` or `ageSec < STALL_MAX_SEC`) → **needs-input**
4. otherwise → **done**

Tunable constants (single location in `status.ts`):
- `RUNNING_SEC = 10`
- `STALL_MAX_SEC = 900` (15 min)

`paneAlive` strengthens confidence; agents not running under tmux fall back to
the recency windows. Rationale for #2: an unanswered tool call on a
still-alive process is most likely blocked on a permission prompt.

Type: `export type BoardColumn = 'running' | 'needs-input' | 'needs-approval' | 'done'`.

### 2. `lastKind` extraction — `src/server/parsers/*.ts` (MODIFIED)

Each parser computes the shape of the **last non-sidechain entry** during
`parseSession`:

- **claude** (real implementation):
  - assistant message containing a `tool_use` with no matching `tool_result`
    later in the file → `tool_pending`
  - finished assistant turn (last meaningful entry is assistant text /
    `stop_reason` end_turn) → `turn_done`
  - last entry is `user` / `tool_result` → `working`
- **codex / pi**: best-effort mapping to the same kinds; default `unknown`.
- **opencode**: `unknown` (SQLite-backed, not live-tailed).

Also capture `lastLine`: a short preview string of the latest activity (last
prompt or tool name) for the card.

Unknown `lastKind` is treated conservatively: it cannot land in
needs-approval/needs-input (rules 2 and 3 require a specific kind), so it falls
through to running (by recency) or done.

### 3. Persistence — `src/server/db.ts` (MODIFIED)

- Add columns `last_kind TEXT` and `last_line TEXT` to the sessions table.
- Migration: additive `ALTER TABLE ... ADD COLUMN` guarded by a check (existing
  DBs upgrade in place; new columns default NULL → treated as `unknown`).
- Extend upsert + row mapping to read/write the new columns.

### 4. API — `src/server/api.ts` (MODIFIED)

New route `GET /api/board?windowH=<n>`:
- Selects sessions where `live === true` OR `ageSec < windowH*3600`.
- Computes `paneAlive` once (single `listPanes()`), maps each session through
  the status engine.
- Returns `[{ ...sessionSummary, column, lastLine, live }]`.
- `windowH` default 6; special value for "live only".

### 5. Frontend

- **Nav + route**: add a "Board" entry (TopBar/TabBar) and a `/board` route in
  `src/ui/router.tsx`.
- **`src/ui/components/BoardView.tsx` (NEW)**:
  - Fetches `/api/board?windowH=…`.
  - Renders 4 columns.
  - Window selector dropdown: 1h / 6h / 24h / live-only.
  - Refreshes on **SSE `/api/events`** *and* on a **5s poll** (the poll is
    required because Running→Needs-Input is triggered by the *absence* of new
    activity, which SSE cannot push).
- **`src/ui/components/BoardCard.tsx` (NEW)**:
  - Shows agent chip, project (cwd basename) + session name, live pip, last
    line, relative time.
  - Click → existing session detail route.
  - Cards in **Needs Input** / **Needs Approval** columns render an inline
    send-box that POSTs to the existing `/api/sessions/:sourceId/:sessionId/input`
    tmux endpoint. On 409 (no pane), show the existing "not attached to tmux"
    message inline.

### 6. Shared types — `src/shared/types.ts` (MODIFIED)

- Add `BoardColumn` and `LastKind` types.
- Add optional `lastKind?` / `lastLine?` to the parsed session metadata, and a
  `BoardEntry` DTO (`session summary + column + lastLine + live`).

## Data Flow (live updates)

1. Agent writes to its `.jsonl` → watcher fires → indexer updates DB (incl.
   `last_kind`, `last_line`) → SSE event emitted.
2. BoardView receives SSE event → refetch `/api/board` (debounced).
3. Independently, BoardView polls every 5s so status can transition purely from
   elapsed time (e.g. Running → Needs Input once a session goes quiet).
4. Server recomputes `column` freshly on every `/api/board` request (status is
   time-dependent, never cached).

## Error Handling

- `/api/board` with a running agent not under tmux → `paneAlive=false`, status
  falls back to recency windows (no error).
- Quick-send to a session with no tmux pane → endpoint already returns 409;
  surface its `detail` message inline on the card.
- Parser cannot determine `lastKind` → `unknown` (safe fallback).
- Missing `last_kind`/`last_line` columns on old DB rows → NULL → `unknown` /
  empty preview.

## Testing

- **Status engine (primary):** table-driven unit tests. For every combination of
  `(ageSec, lastKind, paneAlive)` assert the expected `BoardColumn`, including
  boundary values around `RUNNING_SEC` and `STALL_MAX_SEC`.
- **`lastKind` extraction:** fixture-based tests using small Claude `.jsonl`
  snippets (tool_pending, turn_done, working).
- **Manual QA:** open the board, start a Claude session (via `agt claude`),
  confirm it shows in Running; let the turn finish and confirm it moves to
  Needs Input within the poll interval; verify quick-send unblocks it.

## Files

**New**
- `src/server/status.ts`
- `src/ui/components/BoardView.tsx`
- `src/ui/components/BoardCard.tsx`
- tests for the status engine + lastKind extraction

**Modified**
- `src/shared/types.ts`
- `src/server/db.ts` (migration + mapping)
- `src/server/parsers/claude.ts` (real lastKind), `codex.ts`, `pi.ts`,
  `opencode.ts` (best-effort / unknown)
- `src/server/api.ts` (`/api/board`)
- `src/server/indexer.ts` (carry lastKind/lastLine through upsert if needed)
- `src/ui/router.tsx` + nav (TopBar / TabBar)
