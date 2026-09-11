import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { discover, loadGenreMaps, type SearchResultItem } from '../../providers/tmdb';
import { useSettings, useOnline } from '../hooks';
import { buildContext, type EngineContext } from '../../recommendation/recommend';
import {
  discoverQueryFor, summaryScore, rankDiscover, diversify, isDiscoverable,
  feedTagline, todaySalt, type SummaryScore, type DiscoverSort
} from '../../recommendation/discovery';
import { Chip, Segmented, LabeledSlider, Poster, Empty, Sheet } from '../components';
import { saveSettings } from '../../storage/repo';
import { IconTune } from '../icons';
import type { DiscoveryDials } from '../../data/types';

const GENRES_MOVIE = [['Action', 28], ['Adventure', 12], ['Animation', 16], ['Comedy', 35], ['Crime', 80], ['Documentary', 99], ['Drama', 18], ['Family', 10751], ['Fantasy', 14], ['History', 36], ['Horror', 27], ['Mystery', 9648], ['Romance', 10749], ['Sci-Fi', 878], ['Thriller', 53], ['War', 10752], ['Western', 37]] as const;
const GENRES_TV = [['Drama', 18], ['Comedy', 35], ['Crime', 80], ['Mystery', 9648], ['Sci-Fi & Fantasy', 10765], ['Action & Adventure', 10759], ['Animation', 16], ['Documentary', 99], ['Family', 10751], ['Reality', 10764]] as const;

const SORTS: [DiscoverSort, string][] = [['match', 'Best Match'], ['quality', 'Highest Quality'], ['gems', 'Hidden Gems'], ['adventurous', 'Most Adventurous']];
const MAX_PAGE = 20; // TMDB discover caps at 500 pages; keep sessions sane

export default function Discover() {
  const settings = useSettings();
  const online = useOnline();
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [genres, setGenres] = useState<number[]>([]);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [maxRuntime, setMaxRuntime] = useState<number | undefined>(undefined);
  const [decade, setDecade] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [miniseries, setMiniseries] = useState(false);
  const [onlyMyProviders, setOnlyMyProviders] = useState(false);
  const [sortMode, setSortMode] = useState<DiscoverSort>('match');
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scores, setScores] = useState<Map<string, SummaryScore>>(new Map());
  const [ctx, setCtx] = useState<EngineContext | null>(null);
  const [dialsOpen, setDialsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const dials = settings?.dials;
  const salt = todaySalt();
  const filtersKey = JSON.stringify([mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries, onlyMyProviders, settings?.watchProviders, dials]);

  // context (taste model + library) once per settings change
  useEffect(() => {
    let alive = true;
    loadGenreMaps().then(() => buildContext()).then((c) => { if (alive) setCtx(c); }).catch(() => { if (alive) setCtx(null); });
    return () => { alive = false; };
  }, [settings]);

  // reset + first page whenever any filter or dial changes
  useEffect(() => {
    if (!dials) return;
    let alive = true;
    setLoading(true); setFailed(false); setItems([]); setPage(0); setTotalPages(1);
    const params = discoverQueryFor({
      mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries,
      providers: onlyMyProviders ? settings?.watchProviders : undefined
    }, dials, 1);
    discover(params).then(async (res) => {
      if (!alive) return;
      const { items: first, totalPages: tp } = res;
      setItems(first); setPage(1); setTotalPages(Math.min(tp, MAX_PAGE)); setLoading(false);
    }).catch(() => { if (alive) { setItems([]); setFailed(true); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, dials === undefined]);

  // score everything that arrives, summary-level (plus full-meta blend for known titles)
  useEffect(() => {
    if (!ctx || !items.length) return;
    let alive = true;
    (async () => {
      const map = new Map<string, SummaryScore>();
      for (const it of items) map.set(it.key, summaryScore(it, ctx.model, ctx.settings.dials, salt));
      if (alive) setScores(map);
    })();
    return () => { alive = false; };
  }, [ctx, items, salt]);

  // infinite scroll: fetch the next page when the sentinel enters view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !dials) return;
    const obs = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || loading || loadingMore || page >= totalPages || page < 1) return;
      setLoadingMore(true);
      const next = page + 1;
      discover(discoverQueryFor({
        mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries,
        providers: onlyMyProviders ? settings?.watchProviders : undefined
      }, dials, next)).then((res) => {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.key));
          return [...prev, ...res.items.filter((i) => !seen.has(i.key))];
        });
        setPage(next);
        setLoadingMore(false);
      }).catch(() => setLoadingMore(false));
    }, { rootMargin: '600px' });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalPages, loading, loadingMore, filtersKey]);

  const shown = useMemo(() => {
    const eligible = ctx ? items.filter((i) => isDiscoverable(i.key, ctx.libraryKeys.get(i.key))) : items;
    const ranked = rankDiscover(eligible, scores, sortMode, salt);
    return sortMode === 'match' ? diversify(ranked, scores) : ranked;
  }, [items, scores, sortMode, ctx, salt]);

  const genreList = mediaType === 'movie' ? GENRES_MOVIE : GENRES_TV;
  const setDial = async (k: keyof DiscoveryDials, v: number) => {
    if (!settings) return;
    await saveSettings({ dials: { ...settings.dials, [k]: v } });
  };

  return (
    <div>
      <div className="topbar"><div className="topbar-row">
        <div className="large-title">Discover</div>
        <button className="iconbtn" onClick={() => setDialsOpen(true)} aria-label="Discovery dials"><IconTune /></button>
      </div></div>
      <div style={{ padding: '0 16px' }}>
        <Segmented value={mediaType} onChange={(v) => { setMediaType(v as 'movie' | 'tv'); setGenres([]); }} options={[{ value: 'movie', label: 'Movies' }, { value: 'tv', label: 'Shows' }]} />
      </div>
      <div className="chip-row mt8">
        {genreList.map(([name, id]) => <Chip key={id} label={name} on={genres.includes(id)} onClick={() => setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))} />)}
      </div>
      <div className="chip-row">
        <Chip label="7+ rated" on={minRating === 7} onClick={() => setMinRating((r) => (r === 7 ? undefined : 7))} />
        {mediaType === 'movie' && <Chip label="Under 2h" on={maxRuntime === 120} onClick={() => setMaxRuntime((r) => (r === 120 ? undefined : 120))} />}
        {[2020, 2010, 2000, 1990].map((d) => <Chip key={d} label={`${d}s`} on={decade === d} onClick={() => setDecade((x) => (x === d ? undefined : d))} />)}
        {mediaType === 'tv' && <Chip label="Ended" on={status === '3'} onClick={() => setStatus((s) => (s === '3' ? undefined : '3'))} />}
        {mediaType === 'tv' && <Chip label="Returning" on={status === '0'} onClick={() => setStatus((s) => (s === '0' ? undefined : '0'))} />}
        {mediaType === 'tv' && <Chip label="Miniseries" on={miniseries} onClick={() => setMiniseries((v) => !v)} />}
        {(settings?.watchProviders.length ?? 0) > 0 && <Chip label="On my services" on={onlyMyProviders} onClick={() => setOnlyMyProviders((v) => !v)} />}
      </div>
      <div className="chip-row">
        {(['en', 'es', 'fr', 'de', 'ko', 'ja', 'hi', 'zh'] as const).map((code) => (
          <Chip key={code} label={{ en: 'English', es: 'Spanish', fr: 'French', de: 'German', ko: 'Korean', ja: 'Japanese', hi: 'Hindi', zh: 'Chinese' }[code]} on={language === code} onClick={() => setLanguage((l) => (l === code ? undefined : code))} />
        ))}
      </div>
      <div className="chip-row">
        {SORTS.map(([v, l]) => <Chip key={v} label={l} on={sortMode === v} onClick={() => setSortMode(v)} />)}
      </div>
      {ctx && <div className="footnote" style={{ padding: '2px 20px 6px' }}>{feedTagline(ctx.model)}</div>}

      <div className="poster-grid" style={{ padding: '4px 16px 24px' }}>
        {shown.map((i) => (
          <Link key={i.key} to={`/title/${i.mediaType}/${i.tmdbId}`}>
            <Poster path={i.posterPath} title={i.title} />
            <div className="poster-label">
              <div className="poster-title" style={{ fontSize: 12.5 }}>{i.title}</div>
              <div className="caption num">{i.year ?? ''}{scores.get(i.key) ? ` · ${scores.get(i.key)!.pct}%` : ''}</div>
            </div>
          </Link>
        ))}
      </div>
      {(loading || loadingMore) && <div className="poster-grid" style={{ padding: '4px 16px' }}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 10 }} />)}</div>}
      {!loading && !failed && shown.length === 0 && <Empty title="Nothing found" body={online ? 'Loosen a filter or two.' : 'You are offline - Discover needs a connection.'} />}
      {!loading && failed && <Empty title="Could not load Discover" body={online ? 'The catalog request failed. Pull to retry.' : 'You are offline - Discover needs a connection.'} />}
      {!loading && page >= totalPages && shown.length > 0 && <div className="caption center" style={{ padding: '0 16px 28px' }}>End of this slice - adjust a filter or dial for a fresh cut.</div>}
      <div ref={sentinelRef} style={{ height: 1 }} />

      <Sheet open={dialsOpen} onClose={() => setDialsOpen(false)} title="Discovery dials">
        {dials && (
          <>
            <LabeledSlider label="Familiar / Adventurous" left="Familiar" right="Adventurous" value={dials.familiarAdventurous} onChange={(v) => setDial('familiarAdventurous', v)} />
            <LabeledSlider label="Popular / Hidden gem" left="Popular" right="Hidden gem" value={dials.popularHidden} onChange={(v) => setDial('popularHidden', v)} />
            <LabeledSlider label="Easy / Cerebral" left="Easy" right="Cerebral" value={dials.easyCerebral} onChange={(v) => setDial('easyCerebral', v)} />
            <LabeledSlider label="Light / Dark" left="Light" right="Dark" value={dials.lightDark} onChange={(v) => setDial('lightDark', v)} />
            <LabeledSlider label="Immediate / Slow burn" left="Immediate" right="Slow burn" value={dials.immediateSlowburn} onChange={(v) => setDial('immediateSlowburn', v)} />
            <p className="caption center">Dials change both the catalog request and your ranking - results refetch instantly.</p>
          </>
        )}
      </Sheet>
    </div>
  );
}
