import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../storage/db';
import { getSettings } from '../storage/repo';
import { getTitle, isOnline } from '../providers/tmdb';
import type { LibraryEntry, MediaType, Settings, TitleMeta } from '../data/types';
import { parseKey } from '../data/types';

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), []);
}

export function useLibrary(status?: string): LibraryEntry[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.library.toArray();
    const filtered = status ? all.filter((e) => e.status === status) : all;
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [status]);
}

export function useEntry(key: string | undefined): LibraryEntry | undefined {
  return useLiveQuery(() => (key ? db.library.get(key) : undefined), [key]);
}

export function useTitlesMap(keys: string[] | undefined): Map<string, TitleMeta> | undefined {
  return useLiveQuery(async () => {
    if (!keys) return undefined;
    const rows = await db.titles.bulkGet(keys);
    const map = new Map<string, TitleMeta>();
    rows.forEach((r, i) => { if (r) map.set(keys[i], r); });
    return map;
  }, [JSON.stringify(keys)]);
}

export function useTitleMeta(mediaType: MediaType, tmdbId: number, region = 'US') {
  const [meta, setMeta] = useState<TitleMeta | undefined>();
  const [error, setError] = useState<'offline' | 'missing' | null>(null);
  const [loading, setLoading] = useState(true);
  const key = `${mediaType}:${tmdbId}`;
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    db.titles.get(key).then((cached) => { if (alive && cached) { setMeta(cached); if (cached.detailLevel === 'full') setLoading(false); } });
    getTitle(mediaType, tmdbId, region)
      .then((m) => { if (alive) { setMeta(m); setLoading(false); } })
      .catch((e) => {
        if (!alive) return;
        setLoading(false);
        if (e?.name === 'OfflineError') setError('offline');
        else setError('missing');
      });
    return () => { alive = false; };
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
