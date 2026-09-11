// IMDb ratings via IMDb's official Non-Commercial Datasets
// (https://datasets.imdbws.com/, personal/non-commercial use).
// A build-time script (scripts/build-imdb-ratings.mjs) shrinks the daily TSV
// into small sharded JSON files served as static assets; the app lazy-loads
// one shard per lookup region and caches it on-device. Never a scrape.
import { db } from '../storage/db';

const SHARD_COUNT = 128;
const TTL = 7 * 24 * 60 * 60 * 1000;

export const imdbShardFor = (imdbId: string): number => {
  const n = Number(String(imdbId).replace(/^tt/, ''));
  return Number.isFinite(n) && n >= 0 ? n % SHARD_COUNT : -1;
};
export const imdbShardUrl = (shard: number) => `/imdb-ratings/r${String(shard).padStart(3, '0')}.json`;

export interface ImdbDatasetEntry { rating: number; votes: number }

function extract(data: unknown, imdbId: string): ImdbDatasetEntry | null {
  const e = (data as Record<string, [number, number]> | null)?.[imdbId];
  if (!Array.isArray(e) || e.length < 2) return null;
  return { rating: e[0] / 10, votes: e[1] };
}

export async function lookupImdbRating(imdbId?: string): Promise<ImdbDatasetEntry | null> {
  if (!imdbId || !/^tt\d+$/.test(imdbId)) return null;
  const shard = imdbShardFor(imdbId);
  if (shard < 0) return null;
  const url = imdbShardUrl(shard);
  const now = Date.now();
  try {
    const row = await db.metaCache.get(url);
    if (row && row.expiresAt > now) return extract(row.data, imdbId);
  } catch { /* cache unavailable */ }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try { const stale = await db.metaCache.get(url); if (stale) return extract(stale.data, imdbId); } catch { /* ignore */ }
    return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null; // dataset not deployed on this host - degrade honestly
    const data = await res.json();
    try { await db.metaCache.put({ url, data, fetchedAt: now, expiresAt: now + TTL }); } catch { /* quota */ }
    return extract(data, imdbId);
  } catch { return null; }
}
