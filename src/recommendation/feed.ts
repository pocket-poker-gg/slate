// Paged-feed core: the invariants that make infinite scroll feel native.
// - Append-only: items already on screen are NEVER reordered or removed.
// - Cross-page dedupe: a title can never appear twice, even if the source
//   API reshuffles ties between pages.
// - Page-local ranking: each arriving page is ranked before it is appended,
//   so ranking quality stays high without destabilizing the viewport.
import type { SearchResultItem } from '../providers/tmdb';

export interface FeedPage {
  items: SearchResultItem[];
  page: number;
  totalPages: number;
  totalResults: number;
}

// Merge one freshly ranked page into the accumulated list. Items already
// present (by key, across ALL previously accepted pages) are dropped; the
// relative order of `prev` is preserved exactly. `seen` carries the dedupe
// set across calls so the check is O(1) per item and covers every page ever
// appended, not just the current window.
export function mergeFeedPage(prev: SearchResultItem[], next: SearchResultItem[], seen: Set<string>): SearchResultItem[] {
  for (const it of prev) seen.add(it.key);
  const fresh: SearchResultItem[] = [];
  for (const it of next) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    fresh.push(it);
  }
  return prev.concat(fresh);
}

// Decide whether another page should be fetched to keep the feed feeling
// full: when filtering (library exclusions, gem lanes) shrinks an arriving
// page below a visible threshold, top up immediately instead of making the
// user scroll to trigger it.
export function shouldTopUp(freshCount: number, page: number, totalPages: number, pagesFetchedInARow: number): boolean {
  return freshCount < 8 && page < totalPages && pagesFetchedInARow < 4;
}

// Session cache identity for a feed configuration. Bump the version when the
// item shape changes so stale entries from older app versions never restore.
export const FEED_CACHE_VERSION = 2;
export interface CachedFeed {
  v: number;
  items: SearchResultItem[];
  page: number;
  totalPages: number;
  endReached: boolean;
}

const MAX_CACHED_FEEDS = 6;
const feedCache = new Map<string, CachedFeed>();

export function readFeedCache(key: string): CachedFeed | null {
  const hit = feedCache.get(key);
  if (!hit || hit.v !== FEED_CACHE_VERSION) return null;
  // LRU touch: revisit order decides what survives eviction.
  feedCache.delete(key);
  feedCache.set(key, hit);
  return hit;
}

export function writeFeedCache(key: string, state: CachedFeed): void {
  feedCache.delete(key);
  feedCache.set(key, state);
  while (feedCache.size > MAX_CACHED_FEEDS) {
    const oldest = feedCache.keys().next().value;
    if (oldest === undefined) break;
    feedCache.delete(oldest);
  }
}

export function clearFeedCaches(): void {
  feedCache.clear();
}
