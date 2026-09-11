// Category hub screen: a genre with real subgenre cuts, each grid as
// taste-aware and deeply paginated as Discover itself.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { discover, loadGenreMaps, type SearchResultItem, type Paged } from '../../providers/tmdb';
import { useSettings, useOnline } from '../hooks';
import { buildContext, type EngineContext } from '../../recommendation/recommend';
import { categoryQuery, findHub } from '../../data/categories';
import {
  summaryScore, rankDiscover, diversify, isDiscoverable, todaySalt,
  type SummaryScore
} from '../../recommendation/discovery';
import { Chip, TopBar, Empty } from '../components';
import { FeedGrid } from '../FeedGrid';
import { usePagedFeed } from '../usePagedFeed';
import type { MediaType } from '../../data/types';

export default function Category() {
  const { mediaType: mtParam, hubId } = useParams<{ mediaType: string; hubId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const mediaType: MediaType = mtParam === 'tv' ? 'tv' : 'movie';
  const hub = hubId ? findHub(mediaType, hubId) : undefined;
  const subId = searchParams.get('sub') ?? undefined;
  const sub = hub?.subgenres.find((s) => s.id === subId);

  const settings = useSettings();
  const online = useOnline();
  const [ctx, setCtx] = useState<EngineContext | null>(null);
  const salt = todaySalt();

  useEffect(() => {
    let alive = true;
    loadGenreMaps().then(() => buildContext()).then((c) => { if (alive) setCtx(c); }).catch(() => { if (alive) setCtx(null); });
    return () => { alive = false; };
  }, [settings]);

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const scoresRef = useRef<Map<string, SummaryScore>>(new Map());
  const [scoresTick, setScoresTick] = useState(0);

  const fetchPage = useCallback((page: number): Promise<Paged> => {
    if (!hub) return Promise.reject(new Error('unknown hub'));
    const d = ctxRef.current?.settings.dials;
    const q = categoryQuery(mediaType, hub, sub, page);
    // Dials still shape category requests (hidden-gem lean, runtime cap) by
    // reusing the same dial->query mapping on top of the category cut.
    if (d && d.popularHidden > 0.67) { q.sort = 'vote_average.desc'; q.voteCountGte = Math.min(q.voteCountGte ?? 40, 40); }
    if (d && mediaType === 'movie' && d.immediateSlowburn < 0.34) q.runtimeLte = 110;
    return discover(q);
  }, [hub, sub, mediaType]);

  const preparePage = useCallback((raw: SearchResultItem[]): SearchResultItem[] => {
    const c = ctxRef.current;
    const d = c?.settings.dials;
    const arr = c ? raw.filter((i) => isDiscoverable(i.key, c.libraryKeys.get(i.key))) : raw;
    const scores = scoresRef.current;
    for (const i of arr) {
      if (!scores.has(i.key)) scores.set(i.key, d ? summaryScore(i, c!.model, d, salt) : { total: 0.4, pct: 40, quality: 0, nov: 0, genreAffinity: 0.5 });
    }
    const ranked = rankDiscover(arr, scores, 'match', salt);
    const out = diversify(ranked, scores);
    setScoresTick((t) => t + 1);
    return out;
  }, [salt]);

  const cacheKey = `category:${mediaType}:${hub?.id ?? ''}:${sub?.id ?? ''}`;
  const feed = usePagedFeed({ cacheKey, ready: !!hub, fetchPage, preparePage });

  if (!hub) {
    return (
      <div>
        <TopBar title="Browse" back />
        <Empty title="Unknown category" body="This genre hub does not exist." />
      </div>
    );
  }

  return (
    <div>
      <TopBar title={sub ? `${hub.name}: ${sub.name}` : hub.name} back />
      {hub.subgenres.length > 0 && (
        <div className="chip-row" style={{ paddingTop: 2 }}>
          <Chip label={`All ${hub.name}`} on={!sub} onClick={() => setSearchParams({}, { replace: true })} />
          {hub.subgenres.map((s) => (
            <Chip key={s.id} label={s.name} on={sub?.id === s.id} onClick={() => setSearchParams(s.id === subId ? {} : { sub: s.id }, { replace: true })} />
          ))}
        </div>
      )}
      {ctx && sub === undefined && (
        <div className="footnote" style={{ padding: '2px 20px 6px' }}>
          {ctx.model.signalCount >= 3 ? 'Ranked for your taste inside this genre.' : 'Ranked by quality and novelty - rate titles to retune.'}
        </div>
      )}
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
        emptyHint="This cut is thin - try the whole genre or another subgenre."
      />
    </div>
  );
}
