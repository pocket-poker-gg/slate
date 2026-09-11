// Shared poster grid for paged feeds (Discover, category hubs). Fixed card
// geometry (reserved poster ratio + fixed label lines) so appends never shift
// layout; the loading skeleton only ever appears BELOW existing cards.
import React from 'react';
import { Link } from 'react-router-dom';
import { Poster, CardScores, Empty } from './components';
import type { SearchResultItem } from '../providers/tmdb';
import type { SummaryScore } from '../recommendation/discovery';

export interface FeedGridProps {
  items: SearchResultItem[];
  scores: Map<string, SummaryScore>;
  scoresTick?: number;
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
  endReached: boolean;
  online: boolean;
  sentinelRef: (el: HTMLElement | null) => void;
  emptyHint?: string;
}

export function FeedGrid({ items, scores, loading, loadingMore, failed, endReached, online, sentinelRef, emptyHint }: FeedGridProps) {
  return (
    <>
      <div className="poster-grid feed-grid" style={{ padding: '4px 16px 24px' }}>
        {items.map((i) => (
          <Link key={i.key} to={`/title/${i.mediaType}/${i.tmdbId}`}>
            <Poster path={i.posterPath} title={i.title} />
            <div className="poster-label">
              <div className="poster-title">{i.title}</div>
              <div className="caption num feed-meta">{i.year ?? ''}{scores.get(i.key) ? ` · ${scores.get(i.key)!.pct}%` : ''}</div>
              <CardScores mediaType={i.mediaType} tmdbId={i.tmdbId} />
            </div>
          </Link>
        ))}
        {loadingMore && [0, 1, 2].map((i) => (
          <div key={`sk-${i}`} className="feed-skel">
            <div className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 10 }} />
            <div className="skeleton" style={{ height: 12, marginTop: 7, width: '72%' }} />
          </div>
        ))}
      </div>
      {loading && items.length === 0 && (
        <div className="poster-grid" style={{ padding: '4px 16px' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 10 }} />)}
        </div>
      )}
      {!loading && !failed && items.length === 0 && <Empty title="Nothing found" body={online ? (emptyHint ?? 'Loosen a filter or two.') : 'You are offline - this feed needs a connection.'} />}
      {!loading && failed && items.length === 0 && <Empty title="Could not load" body={online ? 'The catalog request failed. Pull to retry.' : 'You are offline - this feed needs a connection.'} />}
      {endReached && items.length > 0 && <div className="caption center" style={{ padding: '0 16px 28px' }}>End of this slice - adjust a filter or dial for a fresh cut.</div>}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </>
  );
}
