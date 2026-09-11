import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { discover, type SearchResultItem } from '../../providers/tmdb';
import { useSettings, useOnline } from '../hooks';
import { buildContext } from '../../recommendation/recommend';
import { scoreCandidate, matchPct, novelty } from '../../recommendation/engine';
import { commitmentValue } from '../../recommendation/predict';
import { db } from '../../storage/db';
import { Chip, Segmented, LabeledSlider, Poster, Empty, Sheet } from '../components';
import { useToast } from '../components';
import { saveSettings } from '../../storage/repo';
import { posterUrl } from '../../data/config';
import { IconTune } from '../icons';
import type { DiscoveryDials, TitleMeta } from '../../data/types';

const GENRES_MOVIE = [['Action', 28], ['Adventure', 12], ['Animation', 16], ['Comedy', 35], ['Crime', 80], ['Documentary', 99], ['Drama', 18], ['Family', 10751], ['Fantasy', 14], ['History', 36], ['Horror', 27], ['Mystery', 9648], ['Romance', 10749], ['Sci-Fi', 878], ['Thriller', 53], ['War', 10752], ['Western', 37]] as const;
const GENRES_TV = [['Drama', 18], ['Comedy', 35], ['Crime', 80], ['Mystery', 9648], ['Sci-Fi & Fantasy', 10765], ['Action & Adventure', 10759], ['Animation', 16], ['Documentary', 99], ['Family', 10751], ['Reality', 10764]] as const;

type SortMode = 'match' | 'quality' | 'gems' | 'short' | 'adventurous';

export default function Discover() {
  const settings = useSettings();
  const online = useOnline();
  const toast = useToast();
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [genres, setGenres] = useState<number[]>([]);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [maxRuntime, setMaxRuntime] = useState<number | undefined>(undefined);
  const [decade, setDecade] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [onlyMyProviders, setOnlyMyProviders] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('match');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [scored, setScored] = useState<Map<string, { score: number; pct: number; value: number; novelty: number }>>(new Map());
  const [dialsOpen, setDialsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    discover({
      mediaType, genres: genres.length ? genres : undefined, voteGte: minRating,
      runtimeLte: mediaType === 'movie' ? maxRuntime : undefined,
      yearGte: decade, yearLte: decade ? decade + 9 : undefined,
      providers: onlyMyProviders && settings?.watchProviders.length ? settings.watchProviders : undefined,
      status: mediaType === 'tv' ? status : undefined,
      sort: sortMode === 'quality' ? 'vote_average.desc' : 'popularity.desc'
    }).then(async (items) => {
      if (!alive) return;
      setResults(items);
      try {
        const ctx = await buildContext();
        const map = new Map<string, { score: number; pct: number; value: number; novelty: number }>();
        for (const it of items) {
          const meta = await db.titles.get(it.key);
          if (meta && meta.detailLevel === 'full') {
            const c = scoreCandidate(meta, ctx.model, ctx.settings, ctx.settings.dials);
            map.set(it.key, { score: c.total, pct: matchPct(c.total), value: commitmentValue(meta, ctx.model).value, novelty: novelty(meta) });
          }
        }
        if (alive) setScored(map);
      } catch { /* fine */ }
      setLoading(false);
    }).catch(() => { if (alive) { setResults([]); setLoading(false); } });
    return () => { alive = false; };
  }, [mediaType, JSON.stringify(genres), minRating, maxRuntime, decade, status, onlyMyProviders, sortMode, settings?.watchProviders?.length]);

  const shown = useMemo(() => {
    if (!results) return null;
    const arr = [...results];
    const get = (k: string) => scored.get(k);
    switch (sortMode) {
      case 'match': return arr.sort((a, b) => (get(b.key)?.score ?? 0.4) - (get(a.key)?.score ?? 0.4));
      case 'gems': return arr.sort((a, b) => (get(b.key)?.novelty ?? novelty(b as any)) - (get(a.key)?.novelty ?? 0.5));
      case 'short': return arr.sort((a, b) => (get(b.key)?.value ?? 0) - (get(a.key)?.value ?? 0));
      case 'adventurous': return arr.sort((a, b) => ((get(b.key)?.novelty ?? 0.5) + (get(b.key)?.score ?? 0.4)) - ((get(a.key)?.novelty ?? 0.5) + (get(a.key)?.score ?? 0.4)));
      default: return arr;
    }
  }, [results, scored, sortMode]);

  const genreList = mediaType === 'movie' ? GENRES_MOVIE : GENRES_TV;
  const dials = settings?.dials;
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
        {(settings?.watchProviders.length ?? 0) > 0 && <Chip label="On my services" on={onlyMyProviders} onClick={() => setOnlyMyProviders((v) => !v)} />}
      </div>
      <div className="chip-row">
        {([['match', 'Best Match'], ['quality', 'Highest Quality'], ['gems', 'Hidden Gems'], ['short', 'Short Commitment'], ['adventurous', 'Most Adventurous']] as [SortMode, string][]).map(([v, l]) => (
          <Chip key={v} label={l} on={sortMode === v} onClick={() => setSortMode(v)} />
        ))}
      </div>

      <div className="poster-grid" style={{ padding: '4px 16px 24px' }}>
        {shown?.map((i) => (
          <Link key={i.key} to={`/title/${i.mediaType}/${i.tmdbId}`}>
            <Poster path={i.posterPath} title={i.title} />
            <div className="poster-label">
              <div className="poster-title" style={{ fontSize: 12.5 }}>{i.title}</div>
              <div className="caption num">{i.year ?? ''}{scored.get(i.key) ? ` · ${scored.get(i.key)!.pct}%` : ''}</div>
            </div>
          </Link>
        ))}
      </div>
      {loading && <div className="poster-grid" style={{ padding: '4px 16px' }}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 10 }} />)}</div>}
      {!loading && shown && shown.length === 0 && <Empty title="Nothing found" body={online ? 'Loosen a filter or two.' : 'You are offline - Discover needs a connection.'} />}

      <Sheet open={dialsOpen} onClose={() => setDialsOpen(false)} title="Discovery dials">
        {dials && (
          <>
            <LabeledSlider label="Familiar / Adventurous" left="Familiar" right="Adventurous" value={dials.familiarAdventurous} onChange={(v) => setDial('familiarAdventurous', v)} />
            <LabeledSlider label="Popular / Hidden gem" left="Popular" right="Hidden gem" value={dials.popularHidden} onChange={(v) => setDial('popularHidden', v)} />
            <LabeledSlider label="Easy / Cerebral" left="Easy" right="Cerebral" value={dials.easyCerebral} onChange={(v) => setDial('easyCerebral', v)} />
            <LabeledSlider label="Light / Dark" left="Light" right="Dark" value={dials.lightDark} onChange={(v) => setDial('lightDark', v)} />
            <LabeledSlider label="Immediate / Slow burn" left="Immediate" right="Slow burn" value={dials.immediateSlowburn} onChange={(v) => setDial('immediateSlowburn', v)} />
            <p className="caption center">Dials reshape your rankings instantly, on-device.</p>
          </>
        )}
      </Sheet>
    </div>
  );
}
