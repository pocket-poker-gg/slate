import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../storage/db';
import { updateEntry, removeEntry, recordFeedback } from '../../storage/repo';
import { posterUrl, backdropUrl } from '../../data/config';
import type { LibraryEntry, TitleMeta } from '../../data/types';
import { Empty, useToast } from '../components';
import { IconChevronL, IconCheck, IconClock, IconX, IconEye } from '../icons';
import { buildContext } from '../../recommendation/recommend';
import { scoreCandidate, matchPct } from '../../recommendation/engine';

export default function Triage() {
  const [queue, setQueue] = useState<{ entry: LibraryEntry; meta?: TitleMeta; pct?: number }[]>([]);
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(0);
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => {
    (async () => {
      const wl = (await db.library.where('status').equals('watchlist').toArray()).sort((a, b) => a.addedAt - b.addedAt);
      const titles = await db.titles.bulkGet(wl.map((e) => e.key));
      let scores = new Map<string, number>();
      try {
        const ctx = await buildContext();
        titles.forEach((t, i) => { if (t?.detailLevel === 'full') scores.set(wl[i].key, matchPct(scoreCandidate(t, ctx.model, ctx.settings, ctx.settings.dials).total)); });
      } catch { /* fine */ }
      setQueue(wl.map((entry, i) => ({ entry, meta: titles[i] ?? undefined, pct: scores.get(entry.key) })));
    })();
  }, []);

  const current = queue[idx];
  const decide = async (action: 'soon' | 'keep' | 'maybe' | 'remove' | 'watched') => {
    if (!current) return;
    const key = current.entry.key;
    if (action === 'soon') await updateEntry(key, { watchSoon: true, priority: Math.max(1, current.entry.priority) });
    if (action === 'maybe') await updateEntry(key, { priority: 0, watchSoon: false });
    if (action === 'keep') await updateEntry(key, { priority: Math.max(1, current.entry.priority) });
    if (action === 'remove') { await removeEntry(key); await recordFeedback(key, 'less', 'triage'); }
    if (action === 'watched') await updateEntry(key, { status: 'watched', lastWatchedAt: Date.now(), watchCount: 1 });
    setDone((d) => d + 1);
    setIdx((i) => i + 1);
  };

  if (!queue.length) return <div className="page"><Empty title="Backlog is clean" body="Nothing in your watchlist needs triage." action={<Link className="btn btn-primary" to="/library">Library</Link>} /></div>;
  if (idx >= queue.length) return <div className="page"><Empty title={`Done - ${done} triaged`} body="Your watchlist is sharper now." action={<Link className="btn btn-primary" to="/library">Back to Library</Link>} /></div>;

  const { entry, meta, pct } = current;
  const ageDays = Math.round((Date.now() - entry.addedAt) / 86400000);

  return (
    <div className="page">
      <div className="topbar" style={{ margin: '0 -16px' }}><div className="topbar-row">
        <button className="iconbtn plain" onClick={() => nav(-1)} aria-label="Back"><IconChevronL /></button>
        <div className="footnote num">{idx + 1} of {queue.length}</div>
        <div style={{ width: 38 }} />
      </div></div>
      <div className="triage-card mt8">
        {meta?.backdropPath ? <img src={backdropUrl(meta.backdropPath) ?? ''} alt="" /> : meta?.posterPath ? <img src={posterUrl(meta.posterPath, 'w500') ?? ''} alt="" /> : null}
        <div className="triage-info">
          <div className="title-1" style={{ color: '#fff' }}>{meta?.title ?? 'Untitled'}</div>
          <div className="footnote" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {meta?.mediaType === 'movie' ? 'Movie' : 'Series'}{meta?.year ? ` · ${meta.year}` : ''}{pct ? ` · ${pct}% match` : ''}
          </div>
          <div className="caption" style={{ color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
            Saved {ageDays > 30 ? `${Math.round(ageDays / 30)} months` : `${ageDays} days`} ago{entry.skipCount ? ` · skipped ${entry.skipCount}x` : ''}
          </div>
          {meta?.overview && <div className="footnote" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{meta.overview}</div>}
        </div>
      </div>
      <div className="triage-actions">
        <button className="btn btn-primary" onClick={() => decide('soon')}><IconBoltSmall /> Soon</button>
        <button className="btn btn-secondary" onClick={() => decide('keep')}><IconCheck /> Keep</button>
        <button className="btn btn-secondary" onClick={() => decide('watched')}><IconEye /> Watched</button>
        <button className="btn btn-destructive" onClick={() => decide('remove')}><IconX /> Remove</button>
      </div>
      <div className="center"><button className="btn btn-ghost btn-sm" onClick={() => decide('maybe')}><IconClock /> Maybe later</button></div>
    </div>
  );
}
const IconBoltSmall = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M13 2.5 4.5 13.5H11l-1 8L18.5 10H12z" /></svg>;
