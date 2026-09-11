import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { discover, loadGenreMaps, type SearchResultItem, type Paged } from '../../providers/tmdb';
import { useSettings, useOnline } from '../hooks';
import { buildContext, type EngineContext } from '../../recommendation/recommend';
import {
  discoverQueryFor, summaryScore, rankDiscover, diversify, isDiscoverable,
  feedTagline, todaySalt, isGem, gemScore, type SummaryScore, type DiscoverSort
} from '../../recommendation/discovery';
import { hubsFor, hubTileBackdrop } from '../../data/categories';
import { Chip, Segmented, LabeledSlider, Sheet } from '../components';
import { FeedGrid } from '../FeedGrid';
import { usePagedFeed } from '../usePagedFeed';
import { saveSettings } from '../../storage/repo';
import { posterUrl } from '../../data/config';
import { IconTune } from '../icons';
import type { DiscoveryDials, MediaType } from '../../data/types';

const GENRES_MOVIE = [['Action', 28], ['Adventure', 12], ['Animation', 16], ['Comedy', 35], ['Crime', 80], ['Documentary', 99], ['Drama', 18], ['Family', 10751], ['Fantasy', 14], ['History', 36], ['Horror', 27], ['Mystery', 9648], ['Romance', 10749], ['Sci-Fi', 878], ['Thriller', 53], ['War', 10752], ['Western', 37]] as const;
const GENRES_TV = [['Drama', 18], ['Comedy', 35], ['Crime', 80], ['Mystery', 9648], ['Sci-Fi & Fantasy', 10765], ['Action & Adventure', 10759], ['Animation', 16], ['Documentary', 99], ['Family', 10751], ['Reality', 10764]] as const;

const SORTS: [DiscoverSort, string][] = [['match', 'Best Match'], ['quality', 'Highest Quality'], ['gems', 'Hidden Gems'], ['adventurous', 'Most Adventurous']];

// One horizontal genre-hub tile: real artwork from the hub's own catalog cut.
function HubTile({ mediaType, hubId, name }: { mediaType: MediaType; hubId: string; name: string }) {
  const hub = hubsFor(mediaType).find((h) => h.id === hubId)!;
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void hubTileBackdrop(mediaType, hub).then((p) => { if (alive) setArt(p); });
    return () => { alive = false; };
  }, [mediaType, hub]);
  return (
    <Link to={`/browse/${mediaType}/${hub.id}`} className="hub-tile" aria-label={`Browse ${name}`}>
      {art && <img src={posterUrl(art, art.startsWith('/') ? 'w342' : 'w342') ?? ''} alt="" loading="lazy" decoding="async" />}
      <span className="hub-tile-scrim" />
      <span className="hub-tile-name">{name}</span>
    </Link>
  );
}

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
  const [ctx, setCtx] = useState<EngineContext | null>(null);
  const [dialsOpen, setDialsOpen] = useState(false);

  const dials = settings?.dials;
  const salt = todaySalt();

  // context (taste model + library) once per settings change
  useEffect(() => {
    let alive = true;
    loadGenreMaps().then(() => buildContext()).then((c) => { if (alive) setCtx(c); }).catch(() => { if (alive) setCtx(null); });
    return () => { alive = false; };
  }, [settings]);

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const scoresRef = useRef<Map<string, SummaryScore>>(new Map());
  const [scoresTick, setScoresTick] = useState(0);

  const filters = useMemo(() => ({
    mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries,
    providers: onlyMyProviders ? settings?.watchProviders : undefined
  }), [mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries, onlyMyProviders, settings?.watchProviders]);

  const fetchPage = useCallback((page: number): Promise<Paged> => {
    const d = ctxRef.current?.settings.dials ?? dials;
    if (!d) return Promise.reject(new Error('not ready'));
    return discover(discoverQueryFor(filters, d, page, sortMode));
  }, [filters, sortMode, dials]);

  // Score + filter + rank ONE page. Runs synchronously at fetch time so the
  // append is a single commit - no double render, no re-sort of prior pages.
  const preparePage = useCallback((raw: SearchResultItem[]): SearchResultItem[] => {
    const c = ctxRef.current;
    const d = c?.settings.dials;
    let arr = c ? raw.filter((i) => isDiscoverable(i.key, c.libraryKeys.get(i.key))) : raw;
    if (sortMode === 'gems') arr = arr.filter(isGem);
    const scores = scoresRef.current;
    for (const i of arr) {
      if (!scores.has(i.key)) scores.set(i.key, d ? summaryScore(i, c!.model, d, salt) : { total: 0.4, pct: 40, quality: 0, nov: 0, genreAffinity: 0.5 });
    }
    const ranked = rankDiscover(arr, scores, sortMode, salt);
    const out = sortMode === 'match' ? diversify(ranked, scores) : ranked;
    setScoresTick((t) => t + 1);
    return out;
  }, [sortMode, salt]);

  const cacheKey = useMemo(() =>
    `discover:${JSON.stringify([mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries, onlyMyProviders, settings?.watchProviders, dials, sortMode])}`,
  [mediaType, genres, minRating, maxRuntime, decade, status, language, miniseries, onlyMyProviders, settings?.watchProviders, dials, sortMode]);

  const feed = usePagedFeed({ cacheKey, ready: !!dials, fetchPage, preparePage });

  const genreList = mediaType === 'movie' ? GENRES_MOVIE : GENRES_TV;
  const hubs = hubsFor(mediaType);
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

      {/* Deep category browsing: real genre hubs with subgenres, not a chip wall */}
      <section className="section" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 4 }}>
        <div className="section-head"><span className="title-2">Browse by Genre</span></div>
        <div className="hub-rail">
          {hubs.map((h) => <HubTile key={h.id} mediaType={mediaType} hubId={h.id} name={h.name} />)}
        </div>
      </section>

      {ctx && <div className="footnote" style={{ padding: '2px 20px 6px' }}>{feedTagline(ctx.model)}</div>}

      <FeedGrid
        items={feed.items}
        scores={scoresRef.current}
        scoresTick={scoresTick}
        loading={feed.loading}
        loadingMore={feed.loadingMore}
        failed={feed.failed}
        endReached={feed.endReached}
        online={online}
        sentinelRef={feed.sentinelRef}
        emptyHint="Loosen a filter or two."
      />

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
