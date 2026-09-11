import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../storage/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { computeYearStats, computeTasteDNA, computeSourceAlignment, computeTasteEvolution, type YearStats, type TasteDNA, type SourceAlignment } from '../../analytics/stats';
import { buildContext } from '../../recommendation/recommend';
import { predictRating, commitmentValue } from '../../recommendation/predict';
import { Empty, Segmented } from '../components';
import type { TitleMeta } from '../../data/types';

export default function Stats() {
  const diary = useLiveQuery(() => db.diary.toArray(), []);
  const library = useLiveQuery(() => db.library.toArray(), []);
  const titles = useLiveQuery(() => db.titles.toArray(), []);
  const titlesMap = useMemo(() => new Map((titles ?? []).map((t) => [t.key, t])), [titles]);
  const year = new Date().getFullYear();
  const [stats, setStats] = useState<YearStats | null>(null);
  const [dna, setDna] = useState<TasteDNA | null>(null);
  const [align, setAlign] = useState<SourceAlignment[]>([]);
  const [evolution, setEvolution] = useState<{ description: string } | null>(null);
  const [frontier, setFrontier] = useState<{ meta: TitleMeta; minutes: number; predicted: number }[]>([]);
  const [frontierType, setFrontierType] = useState<'both' | 'movie' | 'tv'>('both');

  useEffect(() => {
    if (!diary || !titles) return;
    setStats(computeYearStats(year, library ?? [], diary, titlesMap));
    const rated = (library ?? []).filter((e) => e.rating !== undefined).map((e) => ({ meta: titlesMap.get(e.key), rating: e.rating as number })).filter((r) => r.meta && r.meta.detailLevel === 'full') as { meta: TitleMeta; rating: number }[];
    setDna(computeTasteDNA(rated));
    setAlign(computeSourceAlignment(rated));
    setEvolution(computeTasteEvolution(diary, titlesMap));
    // commitment frontier over watchlist
    (async () => {
      try {
        const ctx = await buildContext();
        const wl = (library ?? []).filter((e) => e.status === 'watchlist');
        const pts: { meta: TitleMeta; minutes: number; predicted: number }[] = [];
        for (const e of wl) {
          const meta = titlesMap.get(e.key);
          if (!meta || meta.detailLevel !== 'full') continue;
          const cv = commitmentValue(meta, ctx.model);
          if (!cv.totalMinutes) continue;
          pts.push({ meta, minutes: cv.totalMinutes, predicted: predictRating(meta, ctx.model).rating });
        }
        setFrontier(pts);
      } catch { /* fine */ }
    })();
  }, [diary, library, titles]);

  if (!library || library.length === 0) return <div className="page"><Empty title="No stats yet" body="Watch and rate some titles first." /></div>;

  const ratedCount = (library ?? []).filter((e) => e.rating !== undefined).length;

  // Pareto frontier over the currently selected format: max predicted enjoyment
  // for any time investment <= x.
  const frontView = useMemo(() => {
    const pts = frontier.filter((p) => frontierType === 'both' || p.meta.mediaType === frontierType);
    const sorted = [...pts].sort((a, b) => a.minutes - b.minutes);
    let best = -1;
    return sorted.map((p) => {
      let front = false;
      if (p.predicted > best + 0.05) { front = true; best = p.predicted; }
      return { ...p, front };
    });
  }, [frontier, frontierType]);
  const completedSeries = (library ?? []).filter((e) => e.status === 'watched' && e.key.startsWith('tv:')).length;
  const dropped = (library ?? []).filter((e) => e.status === 'dropped').length;

  return (
    <div className="page">
      <div className="topbar" style={{ margin: '0 -16px' }}><div className="topbar-row">
        <div className="large-title">Stats</div>
        <Link to={`/year/${year}`} className="btn btn-secondary btn-sm">Year in Review</Link>
      </div></div>

      {stats && (
        <>
          <div className="stat-grid">
            <div className="card card-pad"><div className="stat-big num">{stats.moviesWatched}</div><div className="footnote">Movies in {year}</div></div>
            <div className="card card-pad"><div className="stat-big num">{stats.episodesWatched}</div><div className="footnote">Episodes in {year}</div></div>
            <div className="card card-pad"><div className="stat-big num">{stats.hoursWatched}h</div><div className="footnote">Hours watched</div></div>
            <div className="card card-pad"><div className="stat-big num">{stats.averageRating ?? '-'}</div><div className="footnote">Average rating</div></div>
          </div>
          <div className="stat-grid mt8">
            <div className="card card-pad"><div className="stat-big num">{ratedCount}</div><div className="footnote">Titles rated</div></div>
            <div className="card card-pad"><div className="stat-big num">{completedSeries + dropped > 0 ? Math.round((completedSeries / (completedSeries + dropped)) * 100) : 100}%</div><div className="footnote">Series completion rate</div></div>
          </div>
        </>
      )}

      {dna && dna.basis >= 3 && (
        <section className="section">
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">Taste DNA</span><span className="caption">{dna.basis < 15 ? 'Low confidence - rate more titles' : 'Based on your ratings'}</span></div>
          <div className="card card-pad">
            {dna.dimensions.map((d) => (
              <div key={d.name} className="dna-row">
                <span className="dna-name">{d.name}</span>
                <div className="progressbar"><div style={{ width: `${d.value}%` }} /></div>
                <span className="caption num" style={{ width: 30, textAlign: 'right' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {evolution && (
        <section className="section">
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">Taste Evolution</span></div>
          <div className="card card-pad"><div className="body">{evolution.description}.</div></div>
        </section>
      )}

      {frontier.length >= 4 && (
        <section className="section">
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">Commitment Frontier</span><span className="caption">Watchlist value per hour</span></div>
          <Segmented value={frontierType} onChange={(v) => setFrontierType(v as 'both' | 'movie' | 'tv')} options={[{ value: 'both', label: 'Both' }, { value: 'movie', label: 'Movies' }, { value: 'tv', label: 'TV' }]} />
          <div className="frontier" style={{ marginTop: 12 }}>
            <span className="axis-label" style={{ left: 10, bottom: 6 }}>Time investment</span>
            <span className="axis-label" style={{ left: 10, top: 6 }}>Predicted enjoyment</span>
            {frontView.map((p) => {
              const maxMin = Math.max(...frontView.map((x) => x.minutes));
              const x = 8 + (p.minutes / maxMin) * 84;
              const y = 92 - ((p.predicted - 1) / 4) * 76;
              return (
                <Link key={p.meta.key} to={`/title/${p.meta.mediaType}/${p.meta.tmdbId}`}>
                  <div className={`pt ${p.front ? 'front' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} title={p.meta.title} />
                </Link>
              );
            })}
          </div>
          {frontView.length < 4 && <p className="caption mt8">Not enough {frontierType === 'both' ? '' : frontierType === 'movie' ? 'movie ' : 'series '}titles on your watchlist for this view yet.</p>}
          {frontView.length >= 4 && <p className="caption mt8">White dots sit on the frontier - the most enjoyment per hour in your watchlist.</p>}
        </section>
      )}

      {align.length > 0 && (
        <section className="section">
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">Source Alignment</span></div>
          <div className="card card-pad">
            {align.map((a) => (
              <div key={a.source} className="spread" style={{ padding: '7px 0' }}>
                <span className="body">{a.source}</span>
                <span className="footnote num">
                  {a.correlation !== null ? `${a.correlation.toFixed(2)} · ${a.sample} shared ratings` : a.sample < 8 && a.sample > 0 ? 'Need more shared ratings' : 'Unavailable automatically'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats && stats.topGenres.length > 0 && (
        <section className="section">
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">This Year</span></div>
          <div className="card card-pad" style={{ display: 'grid', gap: 10 }}>
            {stats.topGenres.length > 0 && <div className="spread"><span className="subhead">Top genre</span><span className="body">{stats.topGenres[0].name}</span></div>}
            {stats.topCreators.length > 0 && <div className="spread"><span className="subhead">Top creator</span><span className="body">{stats.topCreators[0].name}</span></div>}
            {stats.topActors.length > 0 && <div className="spread"><span className="subhead">Top actor</span><span className="body">{stats.topActors[0].name}</span></div>}
            {stats.topDecades.length > 0 && <div className="spread"><span className="subhead">Favorite decade</span><span className="body">{stats.topDecades[0].name}</span></div>}
            {stats.topNetworks.length > 0 && <div className="spread"><span className="subhead">Top network</span><span className="body">{stats.topNetworks[0].name}</span></div>}
            {stats.biggestBinge && <div className="spread"><span className="subhead">Biggest binge</span><span className="body">{stats.biggestBinge.title} ({stats.biggestBinge.episodes} eps)</span></div>}
          </div>
        </section>
      )}
      <div style={{ height: 24 }} />
    </div>
  );
}
