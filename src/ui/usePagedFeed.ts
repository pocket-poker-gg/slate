// Shared infinite-scroll feed hook. Powers Discover and category grids with
// identical behavior: stable append-only order, cross-page dedupe, next-page
// prefetch before the fold, automatic top-up when filters shrink a page, and
// a session cache so revisiting the tab renders instantly with no skeleton.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SearchResultItem, Paged } from '../providers/tmdb';
import { mergeFeedPage, readFeedCache, writeFeedCache, FEED_CACHE_VERSION } from '../recommendation/feed';

export interface PagedFeedControls {
  items: SearchResultItem[];
  loading: boolean;       // first page in flight and nothing to show yet
  loadingMore: boolean;   // a subsequent page is in flight
  failed: boolean;        // first page failed (offline or API error)
  endReached: boolean;
  page: number;
  totalPages: number;
  sentinelRef: (el: HTMLElement | null) => void;
}

export interface PagedFeedOptions {
  // Identity of this feed configuration (filters + dials + sort). Changing it
  // resets the feed; revisiting a key restores it instantly from session cache.
  cacheKey: string;
  // False while the ranking context (taste model, library) is still loading.
  ready: boolean;
  fetchPage: (page: number) => Promise<Paged>;
  // Filter + rank one raw page before it is appended. Pure with respect to
  // previously appended items: reorders/filters within the page only.
  preparePage: (items: SearchResultItem[]) => SearchResultItem[];
  maxPage?: number; // TMDB paginates deeply; keep sessions sane
}

const MIN_ITEMS_BEFORE_IDLE = 24; // top up pages until a screenful+ exists

export function usePagedFeed(opts: PagedFeedOptions): PagedFeedControls {
  const { cacheKey, ready, fetchPage, preparePage, maxPage = 20 } = opts;
  const restored = useMemo(() => readFeedCache(cacheKey), [cacheKey]);

  const [items, setItems] = useState<SearchResultItem[]>(restored?.items ?? []);
  const [page, setPage] = useState(restored?.page ?? 0);
  const [totalPages, setTotalPages] = useState(restored?.totalPages ?? 1);
  const [loading, setLoading] = useState(!restored);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [endReached, setEndReached] = useState(restored?.endReached ?? false);

  const seenRef = useRef<Set<string>>(new Set(restored?.items.map((i) => i.key) ?? []));
  const inFlightRef = useRef(false);
  const prefetchRef = useRef<{ page: number; promise: Promise<Paged> } | null>(null);
  const aliveRef = useRef(true);
  const sentinelElRef = useRef<HTMLElement | null>(null);
  const requestMoreRef = useRef<() => void>(() => {});

  const stateRef = useRef({ page, totalPages, loading, loadingMore, endReached });
  stateRef.current = { page, totalPages, loading, loadingMore, endReached };
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const prepareRef = useRef(preparePage);
  prepareRef.current = preparePage;

  // Chase check: after any append, if the sentinel is still within the
  // prefetch margin (short pages, instant jumps), pull the next page
  // immediately. IntersectionObserver alone only fires on crossings and
  // stalls when the sentinel never leaves the margin.
  const chaseSentinel = useCallback(() => {
    const el = sentinelElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight + 1400 && r.bottom > -1400) requestMoreRef.current();
  }, []);

  const loadPage = useCallback(async (next: number): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      let promise: Promise<Paged>;
      const pf = prefetchRef.current;
      if (pf && pf.page === next) {
        promise = pf.promise;
        prefetchRef.current = null;
      } else {
        promise = fetchRef.current(next);
      }
      const res = await promise;
      if (!aliveRef.current) return;
      const prepared = prepareRef.current(res.items);
      setItems((prev) => mergeFeedPage(prev, prepared, seenRef.current));
      setPage(res.page);
      const cap = Math.min(res.totalPages, maxPage);
      setTotalPages(cap);
      if (res.page >= cap) setEndReached(true);
      if (stateRef.current.page === 0) setFailed(false);
    } catch {
      if (!aliveRef.current) return;
      if (stateRef.current.page === 0) setFailed(true);
    } finally {
      inFlightRef.current = false;
      if (aliveRef.current) {
        setLoading(false);
        setLoadingMore(false);
        // Let the append lay out, then chase if the sentinel is still near.
        requestAnimationFrame(() => requestAnimationFrame(() => { if (aliveRef.current) chaseSentinel(); }));
      }
    }
  }, [maxPage, chaseSentinel]);
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  requestMoreRef.current = () => {
    const s = stateRef.current;
    if (!ready || s.loading || s.loadingMore || s.endReached || s.page < 1 || s.page >= s.totalPages) return;
    setLoadingMore(true);
    void loadPageRef.current(s.page + 1);
  };

  // Reset + restore whenever the feed identity changes.
  useEffect(() => {
    aliveRef.current = true;
    const cached = readFeedCache(cacheKey);
    seenRef.current = new Set(cached?.items.map((i) => i.key) ?? []);
    prefetchRef.current = null;
    inFlightRef.current = false;
    setItems(cached?.items ?? []);
    setPage(cached?.page ?? 0);
    setTotalPages(cached?.totalPages ?? 1);
    setEndReached(cached?.endReached ?? false);
    setFailed(false);
    setLoading(!cached);
    setLoadingMore(false);
    return () => { aliveRef.current = false; };
  }, [cacheKey]);

  // Kick off page 1 once the ranking context is ready and nothing is cached.
  useEffect(() => {
    if (!ready || !loading || items.length > 0 || page > 0) return;
    void loadPageRef.current(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading, items.length, page, cacheKey]);

  // Prefetch the next page as soon as the current one lands: by the time the
  // sentinel nears the fold, the data is already here and appends are instant.
  useEffect(() => {
    if (!ready || page < 1 || page >= totalPages || endReached) return;
    const next = page + 1;
    if (prefetchRef.current?.page === next || inFlightRef.current) return;
    const promise = fetchRef.current(next);
    prefetchRef.current = { page: next, promise };
    promise.catch(() => {
      if (prefetchRef.current?.page === next) prefetchRef.current = null;
    });
  }, [ready, page, totalPages, endReached, cacheKey]);

  // Top-up: when filters/library exclusions shrink a page below a screenful,
  // pull the next page immediately instead of stranding the user on a stub.
  useEffect(() => {
    if (!ready || loading || loadingMore) return;
    if (page < 1 || page >= totalPages || endReached) return;
    if (items.length >= MIN_ITEMS_BEFORE_IDLE) return;
    requestMoreRef.current();
  }, [ready, loading, loadingMore, page, totalPages, endReached, items.length, cacheKey]);

  // Sentinel: generous rootMargin so the append lands well before the fold.
  useEffect(() => {
    const el = sentinelElRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) requestMoreRef.current();
    }, { rootMargin: '1400px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cacheKey]);

  // Write-through session cache: revisiting this tab identity renders instantly.
  useEffect(() => {
    if (page < 1) return;
    writeFeedCache(cacheKey, { v: FEED_CACHE_VERSION, items, page, totalPages, endReached });
  }, [cacheKey, items, page, totalPages, endReached]);

  const sentinelRef = useCallback((el: HTMLElement | null) => {
    sentinelElRef.current = el;
  }, []);

  return { items, loading, loadingMore, failed, endReached, page, totalPages, sentinelRef };
}
