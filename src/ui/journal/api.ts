import type { JournalItem } from '../../shared/types';

interface ItemResponse { item: JournalItem; }
interface ItemsResponse { items: JournalItem[]; }

async function asJson<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail = '';
    try {
      const j = await r.json() as { error?: string; detail?: string };
      detail = j.detail || j.error || '';
    } catch { /* ignore */ }
    throw new Error(detail || `${r.status} ${r.statusText}`);
  }
  return (await r.json()) as T;
}

export async function listJournalItems(signal?: AbortSignal): Promise<JournalItem[]> {
  const r = await fetch('/api/journal/items', { signal });
  return (await asJson<ItemsResponse>(r)).items;
}

export async function createJournalItem(item: JournalItem): Promise<JournalItem> {
  const r = await fetch('/api/journal/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ item }),
  });
  return (await asJson<ItemResponse>(r)).item;
}

export async function createJournalItems(items: JournalItem[]): Promise<JournalItem[]> {
  const r = await fetch('/api/journal/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return (await asJson<ItemsResponse>(r)).items;
}

export async function patchJournalItem(id: string, patch: Partial<JournalItem>): Promise<JournalItem> {
  const r = await fetch(`/api/journal/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return (await asJson<ItemResponse>(r)).item;
}

export async function deleteJournalItem(id: string): Promise<void> {
  const r = await fetch(`/api/journal/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
  await asJson<{ ok: boolean }>(r);
}

export async function clearJournalItems(): Promise<void> {
  const r = await fetch('/api/journal/items', { method: 'DELETE' });
  await asJson<{ ok: boolean }>(r);
}
