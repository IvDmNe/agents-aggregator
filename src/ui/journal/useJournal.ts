import { useCallback, useEffect, useState } from 'react';
import type { JournalItem, NewJournalItem } from './types';
import {
  clearJournalItems,
  createJournalItem,
  createJournalItems,
  deleteJournalItem,
  listJournalItems,
  patchJournalItem,
} from './api';

export interface UseJournal {
  items: JournalItem[];
  /** Loading state for the initial fetch. */
  loading: boolean;
  /** Last error from any backend call (read-only — clear it by calling `reload`). */
  error: Error | null;
  add: (entry: NewJournalItem) => JournalItem;
  addMany: (entries: NewJournalItem[]) => JournalItem[];
  remove: (id: string) => void;
  update: (id: string, patch: Partial<JournalItem>) => void;
  toggleDone: (id: string) => void;
  reset: () => void;
  reload: () => void;
}

function randId(i = 0): string {
  return `j-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
}

function complete(entry: NewJournalItem, i = 0): JournalItem {
  return {
    id: randId(i),
    createdAt: Date.now(),
    done: false,
    tags: [],
    ...entry,
  };
}

/**
 * Backend-driven journal. Items are fetched once on mount; mutations apply
 * optimistically and roll back on failure. There is no realtime broadcast —
 * open in another tab and `reload()` if you've been editing elsewhere.
 */
export function useJournal(): UseJournal {
  const [items, setItems] = useState<JournalItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    listJournalItems(ac.signal)
      .then((rows) => setItems(rows))
      .catch((e) => { if ((e as Error).name !== 'AbortError') setError(e as Error); })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const add = useCallback<UseJournal['add']>((entry) => {
    const optimistic = complete(entry);
    setItems((arr) => [optimistic, ...arr]);
    createJournalItem(optimistic)
      .then((saved) => setItems((arr) => arr.map((x) => (x.id === optimistic.id ? saved : x))))
      .catch((e) => {
        setError(e as Error);
        setItems((arr) => arr.filter((x) => x.id !== optimistic.id));
      });
    return optimistic;
  }, []);

  const addMany = useCallback<UseJournal['addMany']>((entries) => {
    const optimistic = entries.map((e, i) => complete(e, i));
    if (optimistic.length === 0) return optimistic;
    setItems((arr) => [...optimistic, ...arr]);
    const ids = new Set(optimistic.map((o) => o.id));
    createJournalItems(optimistic)
      .then((saved) => {
        const byId = new Map(saved.map((s) => [s.id, s]));
        setItems((arr) => arr.map((x) => byId.get(x.id) ?? x));
      })
      .catch((e) => {
        setError(e as Error);
        setItems((arr) => arr.filter((x) => !ids.has(x.id)));
      });
    return optimistic;
  }, []);

  const remove = useCallback<UseJournal['remove']>((id) => {
    let removed: JournalItem | undefined;
    setItems((arr) => {
      const idx = arr.findIndex((x) => x.id === id);
      if (idx < 0) return arr;
      removed = arr[idx];
      return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
    });
    deleteJournalItem(id).catch((e) => {
      setError(e as Error);
      if (removed) {
        const restored = removed;
        setItems((arr) => [restored, ...arr.filter((x) => x.id !== restored.id)]);
      }
    });
  }, []);

  const update = useCallback<UseJournal['update']>((id, patch) => {
    let prev: JournalItem | undefined;
    setItems((arr) => arr.map((x) => {
      if (x.id !== id) return x;
      prev = x;
      return { ...x, ...patch };
    }));
    patchJournalItem(id, patch)
      .then((saved) => setItems((arr) => arr.map((x) => (x.id === id ? saved : x))))
      .catch((e) => {
        setError(e as Error);
        if (prev) {
          const snapshot = prev;
          setItems((arr) => arr.map((x) => (x.id === id ? snapshot : x)));
        }
      });
  }, []);

  const toggleDone = useCallback<UseJournal['toggleDone']>((id) => {
    const cur = items.find((x) => x.id === id);
    update(id, { done: !(cur?.done) });
  }, [items, update]);

  const reset = useCallback<UseJournal['reset']>(() => {
    const snapshot = items;
    setItems([]);
    clearJournalItems().catch((e) => {
      setError(e as Error);
      setItems(snapshot);
    });
  }, [items]);

  return { items, loading, error, add, addMany, remove, update, toggleDone, reset, reload };
}
