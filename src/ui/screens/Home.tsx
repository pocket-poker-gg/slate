import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../storage/db';
import { useLibrary, useSettings, useTitlesMap, useOnline } from '../hooks';
import { generateRecommendations, type Recommendation } from '../../recommendation/recommend';
import { nextEpisode, progressStats } from '../../storage/repo';
import { backdropUrl } from '../../data/config';
import { formatCommitment } from '../../recommendation/predict';
import { PosterLink, SkeletonShelf, Empty, useToast } from '../components';
import { IconSearch, IconBolt } from '../icons';
import type { TitleMeta } from '../../data/types';

// Session caches: returning to Home must render instantly with the last
// good content while fresh data recomputes silently in the background.
let recsCache: Recommendation[] = [];
let recsCacheDay = '';
let recsLoaded = false;
const dayKey = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const settings = useSettings();
  const nav = useNavigate();
  const online = useOnline();
  const all = useLibrary();
  // Memoized: fresh arrays every render would retrigger the effects below forever.
  const watching = useMemo(() => all?.filter((e) => e.status === 'watching'), [all]);
  const watchlist = useMemo(() => all?.filter((e) => e.status === 'watchlist'), [all]);
  const freshCache = recsCacheDay === dayKey();
  const [tonight, setTonight] = useState<Recommendation | null>(freshCache ? recsCache[0] ?? null : null);
  const [recs, setRecs] = useState<Recommendation[]>(freshCache ? recsCache : []);
  const [trendingItems, setTrendingItems] = useState<import('../../providers/tmdb').SearchResultItem[]>([]);
  const [progressRows, setProgressRows] = useState<{ meta: TitleMeta; next: { season: number; episode: number } | null; airDate?: string; pct: number }[]>([]);
  const toast = useToast();

  const keys = useMemo(() => all?.map((e) => e.key), [all]);
  const titles = useTitlesMap(keys);

  useEffect(() => {
    if (settings && !settings.onboarded) nav('/onboarding', { replace: true });
  }, [settings, nav]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await generateRecommendations({ limit: 8 });
        if (!alive) return;
        recsCache = list; recsCacheDay = dayKey(); recsLoaded = true;
        setRecs(list);
        setTonight(list[0] ?? null);
      } catch { if (alive) recsLoaded = true; }
      try {
        const { trending } = await import('../../providers/tmdb');
        const t = await trending('all');
        if (alive) setTrendingItems(t);
      } catch { /* offline */ }
    })();
    return () => { alive = false; };
  }, [online]);

  // continue watching rows
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!watching || !titles) return;
      const rows: typeof progressRows = [];
      for (const e of watching) {
        if (!e.key.startsWith('tv:')) continue;
        const meta = titles.get(e.key);
        if (!meta || meta.detailLevel !== 'full') continue;
        const p = await db.progress.get(e.key);
        if (!p) continue;
        const next = nextEpisode(p, meta.seasons);
        const airingNext = !next && meta.nextAirDate && meta.nextAirDate >= dayKey();
        if (!next && !airingNext) continue;
        rows.push({ meta, next, airDate: airingNext ? meta.nextAirDate : undefined, pct: progressStats(p, meta.numberOfEpisodes, meta.episodeRuntimes[0] ?? 45).pct });
      }
      if (alive) setProgressRows(rows);
    })();
    return () => { alive = false; };
  }, [watching, titles]);

  const shortlist = (watchlist ?? []).filter((e) => e.watchSoon || e.priority > 0).slice(0, 10);
  const finishThis = progressRows.filter((r) => r.pct >= 0.6);
  const recent = (all ?? []).filter((e) => e.status === 'watchlist').slice(0, 10);
  const hiddenGem = recs.find((r) => r.scored.components.novelty > 0.65);
  const libraryKeySet = new Set((all ?? []).filter((e) => e.status === 'watched' || e.status === 'dropped' || e.notInterested || e.dismissedCount >= 2).map((e) => e.key));
  const trendingShelf = trendingItems.filter((i) => !libraryKeySet.has(i.key) && !recs.some((r) => r.scored.meta.key === i.key)).slice(0, 12);
  const becauseKey = tonight?.scored.meta.key;
  const because = recs.filter((r) => r.scored.meta.key !== becauseKey).slice(0, 10);

  const metaOf = (key: string) => titles?.get(key);
  const linkOf = (key: string) => { const [m, id] = key.split(':'); return `/title/${m}/${id}`; };

  return (
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div className="topbar"><div className="topbar-row">
        <div className="large-title">Slate</div>
        <Link to="/search" className="iconbtn" aria-label="Search"><IconSearch /></Link>
      </div></div>
      {!online && <div className="offline-banner">Offline - showing your library and cached picks</div>}

      {/* Continue watching */}
      {progressRows.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">Continue Watching</span></div>
          <div className="shelf">
            {progressRows.map(({ meta, next, airDate, pct }) => (
              <Link key={meta.key} to={linkOf(meta.key)} className="shelf-item cw">
                <div className="poster" style={{ aspectRatio: '16/9' }}>
                  {meta.backdropPath ? <img src={backdropUrl(meta.backdropPath, 'w780') ?? ''} alt={meta.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="poster-fallback">{meta.title}</div>}
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 10px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', color: '#fff', fontSize: 12, fontWeight: 600 }}>{next ? `S${next.season} E${next.episode}` : `Next ep ${fmtAir(airDate!)}`}</div>
                  <div className="progressbar" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 0 }}><div style={{ width: `${Math.round(pct * 100)}%` }} /></div>
                </div>
                <div className="poster-title">{meta.title}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tonight */}
      {!tonight && !recsLoaded && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">Tonight</span></div>
          <div className="skeleton" style={{ aspectRatio: '16/10', borderRadius: 'var(--radius-xl)' }} />
        </section>
      )}
      {tonight && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="section-head" style={{ padding: 0 }}><span className="title-2">Tonight</span><Link to="/tonight">More picks</Link></div>
          <Link to={linkOf(tonight.scored.meta.key)} className="tonight-card" style={{ display: 'block' }}>
            {tonight.scored.meta.backdropPath && <img className="tonight-backdrop" src={backdropUrl(tonight.scored.meta.backdropPath, 'w1280') ?? ''} alt="" loading="lazy" />}
            <div className="tonight-body">
              <span className="match-pct">{tonight.explanation.matchPct}% Match</span>
              <div className="title-1" style={{ color: '#fff', marginTop: 4 }}>{tonight.scored.meta.title}</div>
              <div className="footnote" style={{ color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>
                {tonight.scored.meta.mediaType === 'movie' ? 'Movie' : 'Series'}{tonight.scored.meta.year ? ` · ${tonight.scored.meta.year}` : ''}{formatCommitment(tonight.scored.meta) ? ` · ${formatCommitment(tonight.scored.meta)}` : ''}
              </div>
              <div className="footnote" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>{tonight.explanation.headline}</div>
            </div>
          </Link>
        </section>
      )}
      {tonight && (
        <div style={{ padding: '12px 16px 0' }}>
          <Link to="/tonight" className="btn btn-secondary btn-block"><IconBolt /> What should I watch?</Link>
        </div>
      )}

      {/* Because you loved */}
      {because.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">For You</span></div>
          <div className="shelf">
            {because.map((r) => (
              <PosterLink key={r.scored.meta.key} to={linkOf(r.scored.meta.key)} path={r.scored.meta.posterPath} title={r.scored.meta.title} sub={`${r.explanation.matchPct}% match`} />
            ))}
          </div>
        </section>
      )}
      {!recs.length && !recsLoaded && <section className="section"><SkeletonShelf /></section>}

      {/* Trending this week - live catalog pulse, library-filtered */}
      {trendingShelf.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">Trending This Week</span><Link to="/discover">Discover</Link></div>
          <div className="shelf">
            {trendingShelf.map((i) => (
              <PosterLink key={i.key} to={linkOf(i.key)} path={i.posterPath} title={i.title} sub={i.year ? String(i.year) : 'Now'} />
            ))}
          </div>
        </section>
      )}

      {/* Shortlist */}
      {shortlist.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">Your Shortlist</span><Link to="/library">Watchlist</Link></div>
          <div className="shelf">
            {shortlist.map((e) => { const m = metaOf(e.key); return m ? <PosterLink key={e.key} to={linkOf(e.key)} path={m.posterPath} title={m.title} sub={e.watchSoon ? 'Watch soon' : 'Priority'} /> : null; })}
          </div>
        </section>
      )}

      {/* Finish this */}
      {finishThis.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">Finish This</span></div>
          <div className="shelf">
            {finishThis.map(({ meta, pct }) => <PosterLink key={meta.key} to={linkOf(meta.key)} path={meta.posterPath} title={meta.title} sub={`${Math.round(pct * 100)}% watched`} />)}
          </div>
        </section>
      )}

      {/* Hidden gem */}
      {hiddenGem && (
        <section className="section">
          <div className="section-head"><span className="title-2">Hidden Gem</span></div>
          <Link to={linkOf(hiddenGem.scored.meta.key)} className="cell" style={{ textDecoration: 'none' }}>
            <div className="poster" style={{ width: 84 }}>{hiddenGem.scored.meta.posterPath && <img src={backdropUrl(hiddenGem.scored.meta.posterPath, 'w780') ?? ''} alt="" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />}</div>
            <div className="cell-main">
              <div className="cell-title">{hiddenGem.scored.meta.title}</div>
              <div className="cell-sub">{hiddenGem.explanation.headline}</div>
              <div className="caption mt8">{hiddenGem.explanation.matchPct}% match · less-traveled pick</div>
            </div>
          </Link>
        </section>
      )}

      {/* Recently added */}
      {recent.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">Recently Added</span></div>
          <div className="shelf">
            {recent.map((e) => { const m = metaOf(e.key); return m ? <PosterLink key={e.key} to={linkOf(e.key)} path={m.posterPath} title={m.title} sub={m.year ? String(m.year) : ''} /> : null; })}
          </div>
        </section>
      )}

      {all && all.length === 0 && (
        <Empty title="Start your library"
          body="Search for a show or movie you love and rate it - Slate learns fast."
          action={<Link to="/search" className="btn btn-primary">Find something</Link>} />
      )}
    </div>
  );
}

const fmtAir = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  const today = dayKey();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (iso === today) return 'today';
  if (iso === tomorrow) return 'tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
