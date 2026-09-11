import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db } from '../storage/db';
import { getSettings } from '../storage/repo';
import { getTitle, isOnline } from '../providers/tmdb';
import type { LibraryEntry, MediaType, Settings, TitleMeta } from '../data/types';
import { parseKey } from '../data/types';

// Session-level stale-while-revalidate cache: screens must never flash empty
// when the data was already loaded once this session. Live queries still
// revalidate instantly from IndexedDB and push updates reactively.
const swr = new Map<string, unknown>();

function useCachedLiveQuery<T>(cacheKey: string, querier: () => Promise<T> | T, deps: any[]): T | undefined {
  const result = useLiveQuery<T, T | undefined>(querier, deps, swr.get(cacheKey) as T | undefined);
  useEffect(() => { if (result !== undefined) swr.set(cacheKey, result); }, [result]);
  return result;
}

export function useSettings(): Settings | undefined {
  return useCachedLiveQuery('settings', () => getSettings(), []);
}

export function useLibrary(status?: string): LibraryEntry[] | undefined {
  return useCachedLiveQuery(`library:${status ?? 'all'}`, async () => {
    const all = await db.library.toArray();
    const filtered = status ? all.filter((e) => e.status === status) : all;
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [status]);
}

export function useEntry(key: string | undefined): LibraryEntry | undefined {
  return useCachedLiveQuery(`entry:${key}`, () => (key ? db.library.get(key) : undefined), [key]);
}

export function useTitlesMap(keys: string[] | undefined): Map<string, TitleMeta> | undefined {
  const ser = JSON.stringify(keys);
  return useCachedLiveQuery(`titlesMap:${ser}`, async () => {
    if (!keys) return undefined;
    const rows = await db.titles.bulkGet(keys);
    const map = new Map<string, TitleMeta>();
    rows.forEach((r, i) => { if (r) map.set(keys[i], r); });
    return map;
  }, [ser]);
}

// In-memory title metadata cache: any title seen this session renders
// instantly on revisit (no skeleton), while a background revalidate keeps it fresh.
const metaMem = new Map<string, TitleMeta>();
export function primeTitleMeta(meta: TitleMeta) { metaMem.set(meta.key, meta); }
export function peekTitleMeta(key: string) { return metaMem.get(key); }

export function useTitleMeta(mediaType: MediaType, tmdbId: number, region = 'US') {
  const key = `${mediaType}:${tmdbId}`;
  const [meta, setMeta] = useState<TitleMeta | undefined>(() => metaMem.get(key));
  const [error, setError] = useState<'offline' | 'missing' | null>(null);
  const [loading, setLoading] = useState(() => !metaMem.get(key) || metaMem.get(key)!.detailLevel !== 'full');
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    const cached = metaMem.get(key);
    setMeta(cached);
    setError(null);
    setLoading(!cached || cached.detailLevel !== 'full');
    let cancelled = false;
    aliveRef.current = true;
    db.titles.get(key).then((row) => {
      if (cancelled || !row) return;
      metaMem.set(key, row);
      setMeta(row);
      if (row.detailLevel === 'full') setLoading(false);
    });
    getTitle(mediaType, tmdbId, region)
      .then((m) => { if (cancelled) return; metaMem.set(key, m); setMeta(m); setLoading(false); })
      .catch((e) => {
        if (cancelled) return;
        setLoading(false);
        if (!metaMem.get(key)) setError(e?.name === 'OfflineError' ? 'offline' : 'missing');
      });
    return () => { cancelled = true; aliveRef.current = false; };
  }, [key, region]);
  return { meta, error, loading };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export const keyOf = (mediaType: MediaType, id: number) => `${mediaType}:${id}`;
export { parseKey };
