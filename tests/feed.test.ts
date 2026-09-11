import { describe, it, expect } from 'vitest';
import { mergeFeedPage, shouldTopUp, readFeedCache, writeFeedCache, clearFeedCaches, FEED_CACHE_VERSION } from '../src/recommendation/feed';
import type { SearchResultItem } from '../src/providers/tmdb';

const item = (key: string): SearchResultItem => ({
  key, tmdbId: Number(key.split(':')[1]), mediaType: key.split(':')[0] as 'movie' | 'tv', title: key, genreIds: []
});

describe('mergeFeedPage', () => {
  it('appends new items without ever reordering existing ones', () => {
    const seen = new Set<string>();
    const p1 = mergeFeedPage([], [item('movie:1'), item('movie:2'), item('movie:3')], seen);
    const p2 = mergeFeedPage(p1, [item('movie:9'), item('movie:4')], seen);
    expect(p2.map((i) => i.key)).toEqual(['movie:1', 'movie:2', 'movie:3', 'movie:9', 'movie:4']);
    // Existing prefix object identity/order is preserved exactly.
    expect(p2.slice(0, 3)).toEqual(p1);
  });

  it('dedupes across pages even when the source reshuffles ties', () => {
    const seen = new Set<string>();
    const p1 = mergeFeedPage([], [item('movie:1'), item('movie:2')], seen);
    // TMDB re-serves page-1 titles inside page 2 (popularity tie churn).
    const p2 = mergeFeedPage(p1, [item('movie:2'), item('movie:5'), item('movie:1')], seen);
    expect(p2.map((i) => i.key)).toEqual(['movie:1', 'movie:2', 'movie:5']);
    // And within a single page.
    const p3 = mergeFeedPage(p2, [item('movie:7'), item('movie:7')], seen);
    expect(p3.map((i) => i.key)).toEqual(['movie:1', 'movie:2', 'movie:5', 'movie:7']);
  });

  it('keeps the seen-set across calls so old pages stay deduped', () => {
    const seen = new Set<string>();
    let feed = mergeFeedPage([], [item('movie:1')], seen);
    feed = mergeFeedPage(feed, [item('movie:2')], seen);
    feed = mergeFeedPage(feed, [item('movie:3')], seen);
    const again = mergeFeedPage(feed, [item('movie:1'), item('movie:3')], seen);
    expect(again.map((i) => i.key)).toEqual(['movie:1', 'movie:2', 'movie:3']);
  });
});

describe('shouldTopUp', () => {
  it('tops up thin pages but caps chained fetches', () => {
    expect(shouldTopUp(3, 1, 20, 1)).toBe(true);
    expect(shouldTopUp(20, 1, 20, 1)).toBe(false);
    expect(shouldTopUp(3, 20, 20, 1)).toBe(false); // no more pages
    expect(shouldTopUp(3, 4, 20, 4)).toBe(false); // chain cap
  });
});

describe('feed session cache', () => {
  it('round-trips and preserves exact order', () => {
    clearFeedCaches();
    writeFeedCache('k1', { v: FEED_CACHE_VERSION, items: [item('movie:1'), item('movie:2')], page: 2, totalPages: 5, endReached: false });
    const hit = readFeedCache('k1');
    expect(hit?.items.map((i) => i.key)).toEqual(['movie:1', 'movie:2']);
    expect(hit?.page).toBe(2);
    expect(hit?.endReached).toBe(false);
  });

  it('rejects stale versions and unknown keys', () => {
    clearFeedCaches();
    writeFeedCache('k1', { v: -1, items: [item('movie:1')], page: 1, totalPages: 5, endReached: false });
    expect(readFeedCache('k1')).toBeNull();
    expect(readFeedCache('nope')).toBeNull();
  });

  it('evicts oldest beyond the cap (LRU touch protects revisits)', () => {
    clearFeedCaches();
    for (let i = 0; i < 6; i++) writeFeedCache(`k${i}`, { v: FEED_CACHE_VERSION, items: [], page: 1, totalPages: 1, endReached: true });
    expect(readFeedCache('k0')).not.toBeNull(); // touch k0 -> most recent
    writeFeedCache('k6', { v: FEED_CACHE_VERSION, items: [], page: 1, totalPages: 1, endReached: true });
    expect(readFeedCache('k0')).not.toBeNull();
    expect(readFeedCache('k1')).toBeNull(); // oldest untouched evicted
  });
});
