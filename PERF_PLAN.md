# Perf plan — remaining items

Captured 2026-05-14 after the diff-perf pass. Already shipped: `PierreDiff`/`EntryBlock`/`SessionRow` memoization, stable `onSelect` callbacks, `DeferredMount` IntersectionObserver wrapper around inline diffs, and `useEntries` clearing data on session-id change.

## 1. SSE refetch storm

**Problem.** Every `session_updated` event from `/api/events` bumps `refreshKey` and (for the active session) `activeRefreshKey` in `AppShell.tsx`. Each bump triggers full refetches of `useSources`, `useProjects`, `useSessions`, and `useEntries` (`AppShell.tsx:83-86`, `api.ts:16-85`). A live session that streams N chunks issues ~4N network round trips and replaces four arrays' identities, cascading through all rails.

**Fix.** Coalesce events in `AppShell`'s `onEvent` with a ~150 ms trailing debounce keyed by event class:
- sources/sessions/projects → single debounced `setRefreshKey` bump
- entries → debounced `setActiveRefreshKey` bump only when the event's session matches `activeId`

Wire the existing `entry` SSE event (currently ignored at `AppShell.tsx:128`) so entry-level deltas go through the entries-only path and don't refetch the sidebars.

**Risk.** Streaming feels less "instant"; mitigated by 150ms being below perceptual threshold and the entry event still landing first.

## 2. Preserve entry identity across refetches

**Problem.** `useEntries` (`api.ts:68-90`) replaces `data` with a fresh array of brand-new objects on every refetch. After memoization, `EntryBlock.memo` checks `prev.entry === next.entry` and always sees a different object, so every entry re-renders on every refetch even when content is identical. This defeats most of the memoization win during live streaming.

**Fix.** In `useEntries`, merge by id: walk the new array, reuse the previous entry object when `prevEntry` exists and is deeply equal (or shallowly equal on the fields React reads). Could use a tiny `mergeById(prev, next, isEqual)` helper. The `isEqual` doesn't need to be deep — comparing `id`, `text`, `args`, `streaming`, `timestamp` is enough for our entry shape (`shared/types.ts`).

**Risk.** Bug class: stale state if equality is too eager. Start strict (compare all fields), loosen only if there's a measurable win.

## 3. List virtualization

**Problem.** `ChatView` (`SessionDetail.tsx:221`) maps every entry to a full `EntryBlock`. `DeferredMount` defers the *diff* inside each entry but not the entry chrome, Markdown, images, etc. For sessions with 1000+ entries the DOM grows large and initial mount is still O(n).

**Fix.** Virtualize `ChatView`. Two candidates:
- `@tanstack/react-virtual` — already in the React ecosystem here (we use `@tanstack/react-router`), variable-height friendly via measured items. Recommended.
- `react-window` — simpler but variable-height requires `VariableSizeList` with manual measurements.

Sketch:
- Move the `scrollRef` element to be the virtualizer's `getScrollElement`.
- Each row's `measureElement` hook lets variable heights work without prerendering.
- Keep `DeferredMount` for diffs — virtualization + deferred mount stack cleanly (rows enter the DOM as their slot scrolls in; diffs inside still wait for IO).
- Auto-scroll-to-bottom on new entries (`SessionDetail.tsx:37-42`) becomes `virtualizer.scrollToIndex(entries.length - 1)`.

**Risk.** Behavior gotchas: anchor scrolling when prepending entries (rare here), `Cmd-F` browser find no longer hits off-screen rows, keyboard a11y/focus restoration. The `TimelineView` branch (`SessionDetail.tsx:126`) is unaffected.

## Order of attack

1. **Identity preservation** — small, isolated, immediately reduces work per SSE tick. Pairs naturally with debounce.
2. **SSE debounce** — modest, cuts network and unrelated re-renders during streaming.
3. **Virtualization** — bigger refactor; worth it once we see real sessions push past a few hundred entries.

Measure before each: open DevTools Performance, record a session switch / a 10s streaming window, capture scripting time. Re-record after each step to confirm the win.
