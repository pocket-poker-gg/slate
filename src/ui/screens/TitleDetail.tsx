import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTitleMeta, useEntry, useSettings, useOnline } from '../hooks';
import { setStatus, setRating, toggleFavorite, updateEntry, getEntry, addDiary, recordFeedback, getProgress, progressStats, nextEpisode } from '../../storage/repo';
import { getExternalRatings, computeConsensus } from '../../providers/ratings';
import { getReviews, type TmdbReview } from '../../providers/tmdb';
import type { ExternalRating } from '../../data/types';
import { buildContext } from '../../recommendation/recommend';
import { predictRating, finishLikelihood, formatCommitment } from '../../recommendation/predict';
import { tasteSimilarity } from '../../recommendation/taste';
import { matchPct, scoreCandidate } from '../../recommendation/engine';
import { backdropUrl, logoUrl } from '../../data/config';
import { Poster, Stars, Sheet, useToast, ProviderLogos, PosterLink, Empty, ConfirmSheet } from '../components';
import { IconHeart, IconPlus, IconCheck, IconEye, IconTv, IconChevronR, IconChevronL, IconShare, IconPlay } from '../icons';
import { db } from '../../storage/db';
import type { MediaType, TitleMeta } from '../../data/types';
import { today } from '../../data/util';

export default function TitleDetail() {
  const { mediaType, id } = useParams<{ mediaType: string; id: string }>();
  const mt = (mediaType === 'tv' ? 'tv' : 'movie') as MediaType;
  const numId = Number(id);
  const settings = useSettings();
  const { meta, error, loading } = useTitleMeta(mt, numId, settings?.region ?? 'US');
  const entry = useEntry(meta?.key);
  const online = useOnline();
  const toast = useToast();
  const [ratings, setRatings] = useState<ExternalRating[]>([]);
  const [reviews, setReviews] = useState<TmdbReview[]>([]);
  const [rateOpen, setRateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [matchInfo, setMatchInfo] = useState<{ pct: number; predicted: number; confidence: string; why: string[] } | null>(null);
  const [progress, setProgressState] = useState<{ watched: number; remaining?: number; remainingMinutes?: number; pct: number; next?: { season: number; episode: number } | null } | null>(null);
  const [finish, setFinish] = useState<{ pct: number; note?: string } | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  useEffect(() => {
    if (!meta || meta.detailLevel !== 'full') return;
    getExternalRatings(meta).then(setRatings);
    getReviews(mt, numId).then(setReviews).catch(() => { /* offline or none */ });
    (async () => {
      try {
        const ctx = await buildContext();
        const pred = predictRating(meta, ctx.model);
        const scored = scoreCandidate(meta, ctx.model, ctx.settings, ctx.settings.dials);
        const why: string[] = [];
        const genreHits = meta.genreNames.filter((g) => (ctx.model.genres[g] ?? 0) > 0.25);
        if (genreHits.length) why.push(`Matches your taste for ${genreHits.slice(0, 2).join(' & ').toLowerCase()}`);
        const kw = meta.keywords.filter((k) => (ctx.model.keywords[k.toLowerCase()] ?? 0) > 0.3).slice(0, 3);
        if (kw.length) why.push(`Themes you rate highly: ${kw.join(', ')}`);
        const creators = meta.crew.filter((c) => (ctx.model.creators[c.name] ?? 0) > 0.2).map((c) => c.name);
        if (creators.length) why.push(`From ${creators.slice(0, 2).join(' and ')}`);
        if (meta.providers?.flatrate?.some((p) => ctx.settings.watchProviders.includes(p.id))) why.push('On one of your streaming services');
        setMatchInfo(ctx.model.signalCount >= 3 ? { pct: matchPct(scored.total), predicted: pred.rating, confidence: pred.confidence, why } : null);
        setFinish(finishLikelihood(meta, ctx.model));
      } catch { /* no model yet */ }
    })();
    if (mt === 'tv') {
      getProgress(meta.key).then((p) => {
        const st = progressStats(p, meta.numberOfEpisodes, meta.episodeRuntimes[0] ?? 45);
        setProgressState({ ...st, next: nextEpisode(p, meta.seasons) });
      });
    }
  }, [meta?.key, meta?.fetchedAt]);

  const status = entry?.status;
  const inLibrary = !!status || !!entry?.rating || entry?.favorite;

  const add = async () => { await setStatus(meta!.key, 'watchlist'); toast('Added to watchlist'); };
  const markWatched = async () => {
    await setStatus(meta!.key, 'watched');
    await addDiary({ key: meta!.key, mediaType: mt, date: today(), rating: entry?.rating, rewatch: (entry?.watchCount ?? 0) > 0 });
    toast('Marked as watched');
  };
  const share = async () => {
    const url = window.location.href;
    try { await navigator.share({ title: meta!.title, url }); } catch { /* cancelled */ }
  };

  if (loading && !meta) return <div className="page"><div className="skeleton" style={{ height: 260, borderRadius: 0, margin: '0 -16px' }} /><div className="skeleton mt16" style={{ height: 24, width: '55%' }} /><div className="skeleton mt8" style={{ height: 14, width: '80%' }} /></div>;
  if (!meta) return <div className="page"><Empty title={error === 'offline' ? 'You are offline' : 'Title not found'} body={error === 'offline' ? 'This title is not cached yet. Reconnect to load it.' : 'It may have been removed from the catalog.'} action={<Link className="btn btn-secondary" to="/">Home</Link>} /></div>;

  const consensus = computeConsensus(ratings);
  const tmdbUrl = `https://www.themoviedb.org/${mt}/${meta.tmdbId}`;

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="detail-hero">
        {meta.backdropPath
          ? <><img className="backdrop" src={backdropUrl(meta.backdropPath) ?? undefined} alt="" /><div className="backdrop-fade" /></>
          : <div style={{ height: 120 }} />}
        <button className="iconbtn" onClick={() => history.back()} aria-label="Back" style={{ position: 'absolute', top: 'calc(var(--sat) + 12px)', left: 16, background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(10px)' }}><IconChevronL /></button>
        <button className="iconbtn" onClick={share} aria-label="Share" style={{ position: 'absolute', top: 'calc(var(--sat) + 12px)', right: 16, background: 'rgba(0,0,0,0.45)', color: '#fff', backdropFilter: 'blur(10px)' }}><IconShare /></button>
      </div>
      <div className="detail-head">
        <Poster path={meta.posterPath} title={meta.title} size="w342" />
        <div className="detail-title-block">
          <div className="title-1">{meta.title}</div>
          <div className="meta-line mt8">
            {meta.year && <span>{meta.year}</span>}
            {meta.certification && <><span className="dot" /><span className="badge">{meta.certification}</span></>}
            {meta.runtime ? <><span className="dot" /><span>{Math.floor(meta.runtime / 60)}h {meta.runtime % 60}m</span></> : null}
            {mt === 'tv' && meta.numberOfSeasons ? <><span className="dot" /><span>{meta.numberOfSeasons} season{meta.numberOfSeasons === 1 ? '' : 's'}</span></> : null}
            {meta.status && mt === 'tv' && <><span className="dot" /><span>{meta.status}</span></>}
          </div>
          <div className="meta-line" style={{ marginTop: 6 }}>
            {meta.genreNames.slice(0, 3).map((g) => <span key={g}>{g}</span>).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, <span key={`d${i}`} className="dot" />, el]), [])}
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="action-bar">
        {!status && <button className="btn btn-primary btn-sm" onClick={add}><IconPlus /> Add</button>}
        {status === 'watchlist' && <button className="btn btn-secondary btn-sm" onClick={async () => { await setStatus(meta.key, mt === 'tv' ? 'watching' : 'watchlist'); if (mt === 'tv') toast('Now watching'); }}><IconTv /> {mt === 'tv' ? 'Start watching' : 'In watchlist'}</button>}
        {status === 'watching' && <button className="btn btn-secondary btn-sm" onClick={() => setLogOpen(true)}><IconEye /> Log progress</button>}
        {status !== 'watched' && <button className="btn btn-secondary btn-sm" onClick={markWatched}><IconCheck /> Watched</button>}
        {status === 'watched' && <button className="btn btn-secondary btn-sm" onClick={() => setLogOpen(true)}><IconEye /> Log rewatch</button>}
        <button className="btn btn-secondary btn-sm" onClick={() => setRateOpen(true)}><IconStarInline /> {entry?.rating ? entry.rating : 'Rate'}</button>
        <button className={`btn btn-secondary btn-sm`} onClick={async () => { await toggleFavorite(meta.key); }}><IconHeart filled={entry?.favorite} /> {entry?.favorite ? 'Favorited' : 'Favorite'}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setReviewOpen(true)}>Review</button>
      </div>
      <div className="row" style={{ padding: '0 16px', gap: 8 }}>
        {entry?.status === 'watchlist' && !entry.watchSoon && <button className="chip" onClick={async () => { await updateEntry(meta.key, { watchSoon: true }); toast('Moved to Watch Soon'); }}>+ Watch soon</button>}
        {!entry?.notInterested && !inLibrary && <button className="chip" onClick={async () => { await recordFeedback(meta.key, 'not_interested'); toast('Noted - hidden from recommendations'); }}>Not interested</button>}
        {meta.trailerKey && <a className="chip" href={`https://www.youtube.com/watch?v=${meta.trailerKey}`} target="_blank" rel="noopener noreferrer"><IconPlay /> Trailer</a>}
      </div>

      {/* your match */}
      {matchInfo && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="card card-pad">
            <div className="spread">
              <div><span className="match-pct num" style={{ fontSize: 17 }}>{matchInfo.pct}% Match</span></div>
              <div className="footnote num">Predicted for you: {matchInfo.predicted.toFixed(1)} stars · {matchInfo.confidence} confidence</div>
            </div>
            {matchInfo.why.length > 0 && <div className="footnote mt8">{matchInfo.why.join(' · ')}</div>}
            {finish && <div className="footnote mt8">Finish likelihood: {finish.pct}%{finish.note ? ` - ${finish.note}` : ''}</div>}
            {entry?.rating !== undefined && <div className="mt8"><Stars value={entry.rating} readOnly size="sm" /></div>}
          </div>
        </section>
      )}

      {/* ratings */}
      <section className="section" style={{ padding: '0 16px' }}>
        {ratings.length > 0 && (
          <div className="ratings-line">
            {ratings.filter((r) => r.available && r.value !== undefined).map((r) => (
              <a key={r.source} className="rl-main" href={r.url ?? tmdbUrl} target="_blank" rel="noopener noreferrer">
                <span className="rl-value num">{r.value}</span>
                <span className="footnote">{r.label}{r.voteCount ? ` · ${r.voteCount > 999 ? `${Math.round(r.voteCount / 1000)}k` : r.voteCount} votes` : ''}</span>
              </a>
            ))}
            <span className="rl-links">
              {ratings.filter((r) => !r.available && r.url).map((r) => (
                <a key={r.source} href={r.url} target="_blank" rel="noopener noreferrer" title={`${r.label}: not available automatically - opens ${r.label}`}>{r.label}</a>
              ))}
            </span>
          </div>
        )}
        {!consensus.insufficient && consensus.consensus !== undefined && (
          <div className="footnote center mt8">Consensus {consensus.consensus} · Agreement {consensus.agreement} · Polarization {consensus.polarization}</div>
        )}
      </section>

      {/* overview */}
      {meta.overview && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="title-2">Overview</div>
          <p className="body mt8" style={{ color: 'var(--text-2)' }}>{meta.overview}</p>
        </section>
      )}

      {/* community reviews (TMDB user reviews - the lawful review-text lane) */}
      {reviews.length > 0 && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="title-2">Community reviews</div>
          <div className="mt8" style={{ display: 'grid', gap: 8 }}>
            {reviews.map((r) => <CommunityReviewCard key={r.id} review={r} />)}
          </div>
          <div className="caption mt8">User reviews via TMDB - may contain spoilers</div>
        </section>
      )}

      {/* where to watch */}
      {meta.providers && (meta.providers.flatrate?.length || meta.providers.rent?.length || meta.providers.buy?.length) ? (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="title-2">Where to watch</div>
          {meta.providers.flatrate?.length ? <div className="mt8"><div className="caption" style={{ marginBottom: 6 }}>STREAM</div><ProviderLogos providers={meta.providers.flatrate} max={8} /></div> : null}
          {meta.providers.rent?.length ? <div className="mt8"><div className="caption" style={{ marginBottom: 6 }}>RENT</div><ProviderLogos providers={meta.providers.rent} max={8} /></div> : null}
          {meta.providers.buy?.length ? <div className="mt8"><div className="caption" style={{ marginBottom: 6 }}>BUY</div><ProviderLogos providers={meta.providers.buy} max={8} /></div> : null}
          <div className="caption mt8">Availability for {meta.providers.region} via JustWatch data on TMDB</div>
        </section>
      ) : null}

      {/* TV progress + seasons */}
      {mt === 'tv' && meta.seasons.length > 0 && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="spread"><div className="title-2">Seasons</div>{progress && progress.watched > 0 && <span className="footnote num">{progress.watched} watched{progress.remaining !== undefined ? ` · ${progress.remaining} left` : ''}{progress.remainingMinutes ? ` · ~${Math.floor(progress.remainingMinutes / 60)}h ${progress.remainingMinutes % 60}m remaining` : ''}</span>}</div>
          {progress && progress.pct > 0 && <div className="progressbar mt8"><div style={{ width: `${Math.round(progress.pct * 100)}%` }} /></div>}
          {progress?.next && <div className="footnote mt8">Up next: S{progress.next.season} E{progress.next.episode}</div>}
          <div className="mt8">
            {meta.seasons.map((s) => (
              <Link key={s.seasonNumber} to={`/title/tv/${meta.tmdbId}/season/${s.seasonNumber}`} className="cell" style={{ padding: '10px 0', textDecoration: 'none' }}>
                <div className="poster" style={{ width: 46 }}>{s.posterPath ? <img src={logoUrl(s.posterPath, 'w92') ?? ''} alt="" /> : <div className="poster-fallback">S{s.seasonNumber}</div>}</div>
                <div className="cell-main">
                  <div className="cell-title" style={{ fontSize: 15 }}>{s.name}</div>
                  <div className="cell-sub">{s.episodeCount} episodes{s.airDate ? ` · ${String(s.airDate).slice(0, 4)}` : ''}</div>
                </div>
                <IconChevronR />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* cast */}
      {meta.cast.length > 0 && (
        <section className="section">
          <div className="section-head"><span className="title-2">Cast</span></div>
          <div className="shelf">
            {meta.cast.map((c) => (
              <div key={c.id} className="shelf-item" style={{ width: 84 }}>
                <div className="poster" style={{ aspectRatio: '1', borderRadius: '50%', width: 84 }}>{c.profilePath && <img src={logoUrl(c.profilePath, 'w185') ?? ''} alt={c.name} loading="lazy" />}</div>
                <div className="poster-title center" style={{ marginTop: 6 }}>{c.name}</div>
                <div className="poster-sub center">{c.character}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* review preview */}
      {entry?.review && (
        <section className="section" style={{ padding: '0 16px' }}>
          <div className="title-2">Your review</div>
          <div className="card card-pad mt8">
            {entry.reviewSpoiler ? <SpoilerGate text={entry.review} /> : <p className="body" style={{ whiteSpace: 'pre-wrap' }}>{entry.review}</p>}
          </div>
        </section>
      )}

      {/* similar */}
      {(meta.recommendations.length > 0 || meta.similar.length > 0) && (
        <RelatedShelf keys={[...meta.recommendations, ...meta.similar].slice(0, 12)} />
      )}

      {/* metadata */}
      <section className="section" style={{ padding: '0 16px' }}>
        <div className="title-2">Details</div>
        <div className="subhead mt8" style={{ display: 'grid', gap: 4 }}>
          {meta.crew.filter((c) => ['Director', 'Creator'].includes(c.job)).map((c) => <div key={c.id + c.job}>{c.job === 'Creator' ? 'Created by' : 'Directed by'} <span style={{ color: 'var(--text)' }}>{c.name}</span></div>)}
          {meta.networks.length > 0 && <div>Network <span style={{ color: 'var(--text)' }}>{meta.networks.join(', ')}</span></div>}
          {meta.originalLanguage && <div>Language <span style={{ color: 'var(--text)' }}>{meta.originalLanguage.toUpperCase()}</span></div>}
          {formatCommitment(meta) && <div>Commitment <span style={{ color: 'var(--text)' }}>{formatCommitment(meta)}</span></div>}
          {meta.imdbId && <div><a href={`https://www.imdb.com/title/${meta.imdbId}/`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>View on IMDb</a></div>}
        </div>
      </section>

      {/* sheets */}
      <Sheet open={rateOpen} onClose={() => setRateOpen(false)} title={`Rate ${meta.title}`}>
        <div className="center"><Stars size="lg" value={entry?.rating} onChange={async (v) => { await setRating(meta.key, v); toast(v ? `Rated ${v} stars` : 'Rating removed'); setRateOpen(false); }} /></div>
        <div className="center caption mt8">Tap the left half of a star for a half star</div>
      </Sheet>
      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} tmdbKey={meta.key} mediaType={mt} existing={entry?.review} spoiler={entry?.reviewSpoiler} />
      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} meta={meta} defaultRating={entry?.rating} onDone={() => toast('Logged to diary')} />
    </div>
  );
}

function CommunityReviewCard({ review }: { review: TmdbReview }) {
  const [expanded, setExpanded] = useState(false);
  const SNIP = 280;
  const long = review.content.length > SNIP;
  const text = expanded || !long ? review.content : `${review.content.slice(0, SNIP).trimEnd()}...`;
  return (
    <div className="card card-pad">
      <div className="spread">
        <span className="subhead" style={{ fontWeight: 600 }}>{review.author}</span>
        {review.rating !== undefined && <span className="footnote num">{review.rating}/10</span>}
      </div>
      <p className="body mt8" style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap', margin: 0 }}>{text}</p>
      <div className="row mt8" style={{ gap: 12 }}>
        {long && <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => !e)}>{expanded ? 'Show less' : 'Read more'}</button>}
        {review.url && <a className="btn btn-ghost btn-sm" href={review.url} target="_blank" rel="noopener noreferrer">Full review on TMDB</a>}
      </div>
    </div>
  );
}

const IconStarInline = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3-5.7-3.1-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z" /></svg>;

function SpoilerGate({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  if (show) return <p className="body" style={{ whiteSpace: 'pre-wrap' }}>{text}</p>;
  return <button className="btn btn-secondary btn-sm" onClick={() => setShow(true)}>Show spoiler review</button>;
}

function ReviewSheet({ open, onClose, tmdbKey, mediaType, existing, spoiler }: { open: boolean; onClose: () => void; tmdbKey: string; mediaType: MediaType; existing?: string; spoiler?: boolean }) {
  const [text, setText] = useState(existing ?? '');
  const [isSpoiler, setIsSpoiler] = useState(!!spoiler);
  const toast = useToast();
  useEffect(() => { if (open) { setText(existing ?? ''); setIsSpoiler(!!spoiler); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void updateEntry(tmdbKey, { review: text, reviewSpoiler: isSpoiler, reviewUpdatedAt: Date.now() }); }, 600);
    return () => clearTimeout(t);
  }, [text, isSpoiler, open]);
  return (
    <Sheet open={open} onClose={() => { onClose(); if (text.trim()) toast('Review saved on this device'); }} title="Your review">
      <textarea className="textarea" placeholder="What did you think? Saved privately on this device." value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="spread mt16">
        <label className="row subhead" style={{ gap: 8 }}><input type="checkbox" checked={isSpoiler} onChange={(e) => setIsSpoiler(e.target.checked)} /> Contains spoilers</label>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

function LogSheet({ open, onClose, meta, defaultRating, onDone }: { open: boolean; onClose: () => void; meta: TitleMeta; defaultRating?: number; onDone: () => void }) {
  const [date, setDate] = useState(today());
  const [rating, setRating] = useState<number | undefined>(defaultRating);
  const [rewatch, setRewatch] = useState(false);
  useEffect(() => { if (open) { setDate(today()); setRating(defaultRating); setRewatch(false); } }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Log to diary">
      <div className="field"><label>Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label>Rating</label><div className="center"><Stars value={rating} onChange={setRating} /></div></div>
      <label className="row subhead" style={{ gap: 8, marginBottom: 16 }}><input type="checkbox" checked={rewatch} onChange={(e) => setRewatch(e.target.checked)} /> This was a rewatch</label>
      <button className="btn btn-primary btn-block" onClick={async () => {
        await setStatus(meta.key, meta.mediaType === 'tv' ? 'watching' : 'watched');
        if (rating !== undefined) await updateEntry(meta.key, { rating });
        if (meta.mediaType === 'movie' && !rewatch) await updateEntry(meta.key, { watchCount: Math.max(1, (await getEntry(meta.key)).watchCount), lastWatchedAt: new Date(date).getTime() });
        await addDiary({ key: meta.key, mediaType: meta.mediaType, date, rating, rewatch });
        onDone(); onClose();
      }}>Log it</button>
    </Sheet>
  );
}

function RelatedShelf({ keys }: { keys: string[] }) {
  const [items, setItems] = useState<TitleMeta[]>([]);
  useEffect(() => {
    db.titles.bulkGet(keys).then((rows) => setItems(rows.filter((r): r is TitleMeta => !!r)));
  }, [JSON.stringify(keys)]);
  if (!items.length) return null;
  return (
    <section className="section">
      <div className="section-head"><span className="title-2">More like this</span></div>
      <div className="shelf">
        {items.map((m) => <PosterLink key={m.key} to={`/title/${m.mediaType}/${m.tmdbId}`} path={m.posterPath} title={m.title} sub={m.year ? String(m.year) : ''} />)}
      </div>
    </section>
  );
}
