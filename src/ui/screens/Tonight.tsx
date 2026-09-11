import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tonightRecommendations, onePerfectPick, type Recommendation, type TonightFilters } from '../../recommendation/recommend';
import { recordFeedback } from '../../storage/repo';
import { backdropUrl, posterUrl } from '../../data/config';
import { formatCommitment, predictRating } from '../../recommendation/predict';
import { Chip, Segmented, useToast } from '../components';
import { useOnline, useSettings } from '../hooks';
import { IconBolt, IconChevronL } from '../icons';

const MOODS = ['cerebral', 'intense', 'comforting', 'funny', 'dark', 'weird', 'emotional', 'thrilling', 'background', 'immersive'] as const;

export default function Tonight() {
  const [filters, setFilters] = useState<TonightFilters>({ format: 'either', commitment: 'any', time: 'any', energy: 'normal' });
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [pick, setPick] = useState<Recommendation | null>(null);
  const [mode, setMode] = useState<'choose' | 'pick'>('choose');
  const [showWhy, setShowWhy] = useState(false);
  const [loading, setLoading] = useState(false);
  const online = useOnline();
  const toast = useToast();
  const settings = useSettings();

  const run = async () => {
    setLoading(true);
    try {
      const r = await tonightRecommendations({ ...filters, limit: 7 });
      setResults(r);
    } catch { setResults([]); toast(online ? 'Could not load recommendations' : 'Offline - showing cached picks only'); }
    setLoading(false);
  };

  useEffect(() => { void run(); /* eslint-disable-next-line */ }, []);

  const runPick = async () => {
    setLoading(true); setShowWhy(false);
    const p = await onePerfectPick(filters);
    setPick(p);
    if (p) await recordFeedback(p.scored.meta.key, 'picked', 'one-perfect-pick');
    setLoading(false);
  };

  const set = <K extends keyof TonightFilters>(k: K, v: TonightFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  const linkOf = (key: string) => { const [m, id] = key.split(':'); return `/title/${m}/${id}`; };

  return (
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div className="topbar"><div className="topbar-row">
        <Link to="/" className="iconbtn plain" aria-label="Back"><IconChevronL /></Link>
        <div className="title-1" style={{ fontSize: 20 }}>What should I watch?</div>
        <div style={{ width: 38 }} />
      </div></div>

      <div style={{ padding: '0 16px' }}>
        <Segmented ariaLabel="Mode" value={mode} onChange={(m) => { setMode(m); if (m === 'pick' && !pick) void runPick(); if (m === 'choose' && !results) void run(); }}
          options={[{ value: 'choose', label: 'A few great options' }, { value: 'pick', label: 'Just pick something' }]} />

        <div className="section" style={{ marginTop: 18 }}>
          <div className="footnote" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Time</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {([['lt30', 'Under 30 min'], ['h1', 'About an hour'], ['h2', 'A couple hours'], ['any', 'Any']] as const).map(([v, l]) => <Chip key={v} label={l} on={filters.time === v} onClick={() => set('time', v)} />)}
          </div>
        </div>
        <div className="section" style={{ marginTop: 14 }}>
          <div className="footnote" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Mood</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {MOODS.map((m) => <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} on={filters.mood === m} onClick={() => set('mood', filters.mood === m ? undefined : m)} />)}
          </div>
        </div>
        <div className="section" style={{ marginTop: 14 }}>
          <div className="footnote" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Format</div>
          <Segmented value={filters.format ?? 'either'} onChange={(v) => set('format', v)} options={[{ value: 'either', label: 'Either' }, { value: 'movie', label: 'Movie' }, { value: 'tv', label: 'Series' }]} />
        </div>
        <div className="section" style={{ marginTop: 14 }}>
          <div className="footnote" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Commitment</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {([['one_sitting', 'One sitting'], ['miniseries', 'Miniseries'], ['short_series', 'Short series'], ['any', "Don't care"]] as const).map(([v, l]) => <Chip key={v} label={l} on={filters.commitment === v} onClick={() => set('commitment', v)} />)}
          </div>
        </div>
        {(settings?.watchProviders.length ?? 0) > 0 && (
          <div className="section" style={{ marginTop: 14 }}>
            <div className="footnote" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Availability</div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Chip label="On my services" on={!!filters.providersOnly} onClick={() => set('providersOnly', filters.providersOnly ? undefined : true)} />
            </div>
          </div>
        )}
        <div className="section" style={{ marginTop: 14 }}>
          <div className="footnote" style={{ marginBottom: 8, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Energy</div>
          <Segmented value={filters.energy ?? 'normal'} onChange={(v) => set('energy', v)} options={[{ value: 'tired', label: 'Tired' }, { value: 'normal', label: 'Normal' }, { value: 'focused', label: 'Focused' }]} />
        </div>
        <button className="btn btn-primary btn-block mt24" disabled={loading} onClick={() => (mode === 'choose' ? run() : runPick())}>
          {loading ? 'Thinking...' : mode === 'choose' ? 'Find my options' : 'Pick for me'}
        </button>
      </div>

      {mode === 'choose' && results !== null && (
        <div className="section fade-list">
          {results.length === 0 && !loading && <p className="footnote center">No strong matches for those filters - loosen one or two.</p>}
          {results.map((r) => (
            <Link key={r.scored.meta.key} to={linkOf(r.scored.meta.key)} className="cell" style={{ textDecoration: 'none' }}>
              <div className="poster" style={{ width: 64 }}>{r.scored.meta.posterPath ? <img src={posterUrl(r.scored.meta.posterPath, 'w185') ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}</div>
              <div className="cell-main">
                <div className="spread"><span className="cell-title">{r.scored.meta.title}</span><span className="match-pct num">{r.explanation.matchPct}%</span></div>
                <div className="cell-sub">{r.explanation.headline}</div>
                <div className="caption mt8">{formatCommitment(r.scored.meta) ?? ''}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {mode === 'pick' && pick && (
        <div className="section fade-list" style={{ padding: '0 16px' }}>
          <div className="tonight-card">
            {pick.scored.meta.backdropPath && <img className="tonight-backdrop" src={backdropUrl(pick.scored.meta.backdropPath, 'w1280') ?? ''} alt="" />}
            <div className="tonight-body">
              <span className="match-pct">{pick.explanation.matchPct}% Match</span>
              <div className="title-1" style={{ color: '#fff', marginTop: 4 }}>{pick.scored.meta.title}</div>
              <div className="footnote" style={{ color: 'rgba(255,255,255,0.8)' }}>{pick.scored.meta.mediaType === 'movie' ? 'Movie' : 'Series'} · {formatCommitment(pick.scored.meta) ?? 'Any length'}</div>
            </div>
          </div>
          {showWhy && (
            <div className="card card-pad mt16">
              <div className="headline">{pick.explanation.headline}</div>
              <ul style={{ margin: '10px 0 0 18px' }} className="subhead">
                {pick.explanation.reasons.map((r, i) => <li key={i} style={{ marginBottom: 5 }}>{r}</li>)}
              </ul>
            </div>
          )}
          <div className="row mt16" style={{ gap: 8 }}>
            <Link to={linkOf(pick.scored.meta.key)} className="btn btn-primary grow">Watch</Link>
            <button className="btn btn-secondary grow" onClick={async () => { await recordFeedback(pick.scored.meta.key, 'skip', 'one-perfect-pick'); void runPick(); }}>Another</button>
          </div>
          <div className="row mt8" style={{ gap: 8 }}>
            <button className="btn btn-ghost grow" onClick={() => setShowWhy((s) => !s)}>Why?</button>
            <button className="btn btn-ghost grow" onClick={async () => { await recordFeedback(pick.scored.meta.key, 'not_interested', 'one-perfect-pick'); toast('Noted - fewer like this'); void runPick(); }}>Not interested</button>
          </div>
        </div>
      )}
      {mode === 'pick' && !pick && !loading && <p className="footnote center section">Rate a few titles first so Slate can pick well.</p>}
    </div>
  );
}
