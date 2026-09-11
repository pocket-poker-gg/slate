// Card-level IMDb + Rotten Tomatoes scores for poster grids and shelves.
//
// IMDb: the card resolves its IMDb id through TMDB's cheap external_ids
// endpoint (cached 30 days on-device), then reads the rating from the
// build-time IMDb shard bundle (local static JSON, cached on-device). No
// scraping, no bulk mapping guesswork, always current.
//
// Rotten Tomatoes: OMDb behind a persisted daily budget. The free tier allows
// 1,000 requests/day and title pages already spend from it, so cards fetch
// lazily (only after the card has been visibly on screen for a beat),
// concurrency-capped and in-session deduped, and degrade silently to
// IMDb-only when the budget is spent. Cached RT values always render.
import type { MediaType } from '../data/types';
import { getExternalIds } from './tmdb';
import { lookupImdbRating } from './imdbDataset';
import { getOmdbRatings, getCachedOmdbRatings, type OmdbRatings } from './omdb';

export interface CardRating {
  imdbId: string;
  imdb?: number;      // 0..10, from the bundled official IMDb dataset
  imdbVotes?: number;
}

// In-session dedupe: one resolution per title no matter how many cards show it.
const resolveMem = new Map<string, Promise<CardRating | null>>();

// Network entry point for cards. Call only behind a visibility gate so a fast
// scroll-past never spends a request.
export function resolveCardRating(mediaType: MediaType, tmdbId: number): Promise<CardRating | null> {
  const id = `${mediaType}:${tmdbId}`;
  const hit = resolveMem.get(id);
  if (hit) return hit;
  const promise = (async (): Promise<CardRating | null> => {
    try {
      const { imdbId } = await getExternalIds(mediaType, tmdbId);
      if (!imdbId) { resolveMem.set(id, Promise.resolve(null)); return null; }
      const ds = await lookupImdbRating(imdbId);
      return { imdbId, imdb: ds?.rating, imdbVotes: ds?.votes };
    } catch {
      resolveMem.delete(id); // transient failure: allow a later retry
      return null;
    }
  })();
  resolveMem.set(id, promise);
  return promise;
}

// --- RT lazy-fetch budget (persisted daily) ---
export const RT_CARD_DAILY_CAP = 120;
const BUDGET_KEY = 'slate.rtCardBudget';
export const budgetDayOf = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface RtBudget { day: string; used: number }
export const readRtBudget = (now: number, storage?: Pick<Storage, 'getItem'>): RtBudget => {
  const day = budgetDayOf(now);
  try {
    const raw = (storage ?? localStorage).getItem(BUDGET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RtBudget;
      if (parsed && parsed.day === day && Number.isFinite(parsed.used)) return { day, used: Math.max(0, parsed.used) };
    }
  } catch { /* storage unavailable or corrupt */ }
  return { day, used: 0 };
};
export const spendRtBudget = (now: number, storage?: Pick<Storage, 'getItem' | 'setItem'>): boolean => {
  const b = readRtBudget(now, storage);
  if (b.used >= RT_CARD_DAILY_CAP) return false;
  try { (storage ?? localStorage).setItem(BUDGET_KEY, JSON.stringify({ day: b.day, used: b.used + 1 })); } catch { /* ignore */ }
  return true;
};

// --- Budgeted, concurrency-capped, in-session-deduped RT fetch ---
const MAX_CONCURRENT = 2;
let activeFetches = 0;
const waitQueue: (() => void)[] = [];
const inflight = new Map<string, Promise<OmdbRatings | null>>();

export async function requestRtForCard(imdbId: string, now = Date.now()): Promise<OmdbRatings | null> {
  const cached = await getCachedOmdbRatings(imdbId);
  if (cached !== undefined) return cached;
  const pending = inflight.get(imdbId);
  if (pending) return pending;
  if (!spendRtBudget(now)) return null; // budget spent: cards silently stay IMDb-only
  const promise = (async () => {
    while (activeFetches >= MAX_CONCURRENT) await new Promise<void>((r) => waitQueue.push(r));
    activeFetches++;
    try {
      return await getOmdbRatings(imdbId);
    } finally {
      activeFetches--;
      inflight.delete(imdbId);
      const next = waitQueue.shift();
      if (next) next();
    }
  })();
  inflight.set(imdbId, promise);
  return promise;
}

export const cachedRtForCard = (imdbId: string) => getCachedOmdbRatings(imdbId);
