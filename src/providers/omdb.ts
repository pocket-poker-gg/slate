// OMDb (omdbapi.com) - a lawful aggregator API (CC BY-NC 4.0). One free-tier
// key, called directly from the client exactly like TMDB. Requests contain
// only an IMDb title id; no personal data ever leaves the device.
// Used for Rotten Tomatoes (Tomatometer) and Metacritic (Metascore), and as a
// fallback mirror of the IMDb score when the bundled dataset misses a title.
import { OMDB_API_KEY, OMDB_API_BASE } from '../data/config';
import { db } from '../storage/db';

const TTL = 3 * 24 * 60 * 60 * 1000;
const OVERRIDE_KEY = 'slate.omdbKeyOverride';
export function getOmdbKeyOverride(): string { try { return localStorage.getItem(OVERRIDE_KEY) || ''; } catch { return ''; } }
export function setOmdbKeyOverride(k: string) { try { const v = k.trim(); if (v) localStorage.setItem(OVERRIDE_KEY, v); else localStorage.removeItem(OVERRIDE_KEY); } catch { /* storage unavailable */ } }
const activeKey = () => getOmdbKeyOverride() || OMDB_API_KEY;
export const hasOmdbKey = () => activeKey().length > 0;

export interface OmdbRatings {
  imdbRating?: number;   // 0..10
  imdbVotes?: number;
  metascore?: number;    // 0..100, critic aggregate
  tomatometer?: number;  // 0..100, % of critics who rated positively - NOT an average rating
}

const num = (v: unknown): number | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

export function parseOmdb(payload: any): OmdbRatings | null {
  if (!payload || payload.Response !== 'True') return null;
  const out: OmdbRatings = {};
  const imdb = num(payload.imdbRating);
  if (imdb !== undefined) out.imdbRating = imdb;
  const votes = num(payload.imdbVotes);
  if (votes !== undefined) out.imdbVotes = votes;
  const meta = num(payload.Metascore);
  if (meta !== undefined) out.metascore = meta;
  const rt = (payload.Ratings as { Source?: string; Value?: string }[] | undefined)?.find((r) => r.Source === 'Rotten Tomatoes')?.Value;
  if (rt) {
    const pct = num(String(rt).replace('%', ''));
    if (pct !== undefined) out.tomatometer = pct;
  }
  return Object.keys(out).length ? out : null;
}

export async function getOmdbRatings(imdbId?: string): Promise<OmdbRatings | null> {
  if (!imdbId || !/^tt\d+$/.test(imdbId) || !hasOmdbKey()) return null;
  const url = `${OMDB_API_BASE}?apikey=${activeKey()}&i=${imdbId}`;
  const now = Date.now();
  try {
    const row = await db.metaCache.get(url);
    if (row && row.expiresAt > now) return row.data as OmdbRatings | null;
  } catch { /* cache unavailable */ }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try { const stale = await db.metaCache.get(url); if (stale) return stale.data as OmdbRatings | null; } catch { /* ignore */ }
    return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const parsed = parseOmdb(await res.json());
    try { await db.metaCache.put({ url, data: parsed, fetchedAt: now, expiresAt: now + TTL }); } catch { /* quota */ }
    return parsed;
  } catch { return null; }
}
