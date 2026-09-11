import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { popular, topRated, trending, listWatchProviders, searchMulti, type SearchResultItem, type WatchProviderOption } from '../../providers/tmdb';
import { db } from '../../storage/db';
import { updateEntry, saveSettings } from '../../storage/repo';
import { logoUrl } from '../../data/config';
import { DEFAULT_SLIDERS, type SliderSet } from '../../data/types';
import { LabeledSlider, Poster, Stars } from '../components';
import { IconSearch, IconX } from '../icons';

type PickedMap = Map<string, { item: SearchResultItem; rating?: number }>;

const togglePick = (map: PickedMap, setMap: (m: PickedMap) => void, item: SearchResultItem) => {
  const next = new Map(map);
  if (next.has(item.key)) next.delete(item.key); else next.set(item.key, { item });
  setMap(next);
};

function PosterPick({ item, map, setMap }: { item: SearchResultItem; map: PickedMap; setMap: (m: PickedMap) => void }) {
  const on = map.has(item.key);
  return (
    <button onClick={() => togglePick(map, setMap, item)} style={{ textAlign: 'left', position: 'relative' }} aria-pressed={on}>
      <Poster path={item.posterPath} title={item.title} size="w342" />
      {on && <div style={{ position: 'absolute', inset: 0, borderRadius: 10, outline: '3px solid var(--accent)', outlineOffset: -1.5, background: 'rgba(255,255,255,0.08)' }} />}
      <div className="poster-title" style={{ fontSize: 12, marginTop: 6 }}>{item.title}</div>
      <div className="caption">{item.year ?? ''}</div>
    </button>
  );
}

// Free-text search + deep multi-source grid: find any title, not just the ones shown.
function PickSearch({ pool, poolMore, map, setMap, exclude, placeholder }: { pool: SearchResultItem[]; poolMore: SearchResultItem[]; map: PickedMap; setMap: (m: PickedMap) => void; exclude: PickedMap; placeholder: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await searchMulti(q.trim()); setResults(r.items.slice(0, 24)); }
      catch { setResults([]); }
      setSearching(false);
    }, 260);
    return () => clearTimeout(t);
  }, [q]);
  const gridItems = results !== null ? results : [...pool, ...poolMore].filter((i) => !exclude.has(i.key)).slice(0, 90);
  return (
    <div>
      <div style={{ position: 'relative', marginTop: 14 }}>
        <span style={{ position: 'absolute', left: 13, top: 13, color: 'var(--text-3)', width: 16, height: 16, pointerEvents: 'none' }}><IconSearch /></span>
        <input className="input" style={{ paddingLeft: 38 }} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search titles" autoCapitalize="off" autoCorrect="off" />
        {q.length > 0 && <button className="iconbtn plain" aria-label="Clear search" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setQ('')}><IconX /></button>}
      </div>
      {map.size > 0 && (
        <div className="shelf" style={{ padding: '12px 0 4px' }}>
          {[...map.values()].map(({ item }) => (
            <div key={item.key} className="shelf-item" style={{ width: 64 }}>
              <button onClick={() => togglePick(map, setMap, item)} aria-label={`Remove ${item.title}`} style={{ position: 'relative', display: 'block' }}>
                <Poster path={item.posterPath} title={item.title} size="w154" />
                <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--accent)', color: 'var(--accent-contrast)', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>×</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {searching && <div className="poster-grid mt16">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3', borderRadius: 10 }} />)}</div>}
      {!searching && results !== null && results.length === 0 && <p className="footnote mt16">No matches for "{q}".</p>}
      {!searching && (
        <div className="poster-grid mt16">
          {gridItems.map((i) => <PosterPick key={i.key} item={i} map={map} setMap={setMap} />)}
        </div>
      )}
      {results === null && pool.length === 0 && <p className="footnote mt16">Loading titles... if you are offline, skip ahead - you can always rate titles later.</p>}
    </div>
  );
}

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [pool, setPool] = useState<SearchResultItem[]>([]);
  const [poolMore, setPoolMore] = useState<SearchResultItem[]>([]);
  const [loved, setLoved] = useState<PickedMap>(new Map());
  const [disliked, setDisliked] = useState<PickedMap>(new Map());
  const [pairs, setPairs] = useState<[SearchResultItem, SearchResultItem][]>([]);
  const [pairIdx, setPairIdx] = useState(0);
  const [pairAnswers, setPairAnswers] = useState<[string, string, 'a' | 'b'][]>([]);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [selProviders, setSelProviders] = useState<number[]>([]);
  const [sliders, setSliders] = useState<SliderSet>({ ...DEFAULT_SLIDERS });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const merge = (lists: SearchResultItem[][]) => {
        const seen = new Set<string>();
        return lists.flat().filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
      };
      try {
        // first wave: fast, recognizable titles for instant picking
        const [pm, pt, tr] = await Promise.all([popular('movie'), popular('tv'), trending('all')]);
        const first = merge([pm, pt, tr]);
        setPool(first);
        const shuffled = [...first].sort(() => 0.5 - Math.random());
        const ps: [SearchResultItem, SearchResultItem][] = [];
        for (let i = 0; i + 1 < shuffled.length && ps.length < 5; i += 2) ps.push([shuffled[i], shuffled[i + 1]]);
        setPairs(ps);
        // second wave: depth - more pages + top rated, so the grids feel endless
        const [pm2, pt2, tm, tt, pm3, pt3] = await Promise.all([
          popular('movie', 2), popular('tv', 2), topRated('movie'), topRated('tv'), popular('movie', 3), popular('tv', 3)
        ]);
        const firstKeys = new Set(first.map((i) => i.key));
        setPoolMore(merge([pm2, pt2, tm, tt, pm3, pt3]).filter((i) => !firstKeys.has(i.key)));
      } catch { /* offline onboarding handled below */ }
      try { setProviders((await listWatchProviders('US')).slice(0, 40)); } catch { /* offline */ }
    })();
  }, []);

  const steps = ['Welcome', 'Love', 'Rate', 'Dislike', 'Versus', 'Streaming', 'Taste'];

  const finish = async () => {
    setSaving(true);
    for (const { item, rating } of loved.values()) {
      await updateEntry(item.key, { status: 'watched', favorite: (rating ?? 4.5) >= 4.5, rating: rating ?? 4.5, watchCount: 1, lastWatchedAt: Date.now(), firstWatchedAt: Date.now() });
    }
    for (const { item } of disliked.values()) {
      if (loved.has(item.key)) continue;
      await updateEntry(item.key, { status: 'watched', rating: 1.5, watchCount: 1, lastWatchedAt: Date.now(), firstWatchedAt: Date.now() });
    }
    for (const [a, b, w] of pairAnswers) await db.pairwise.add({ aKey: a, bKey: b, winner: w, at: Date.now() });
    await saveSettings({ watchProviders: selProviders, sliders, onboarded: true });
    nav('/', { replace: true });
  };

  const lovedArr = [...loved.values()];

  return (
    <div className="onboard">
      <div className="ob-progress">{steps.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
      <div className="grow" style={{ overflowY: 'auto' }}>
        {step === 0 && (
          <div className="fade-list" style={{ textAlign: 'center', paddingTop: '12vh' }}>
            <img src="/icons/icon-192.png" width={76} height={76} style={{ margin: '0 auto 26px', borderRadius: 18 }} alt="Slate" />
            <div className="large-title" style={{ fontSize: 34 }}>Your movies and shows.</div>
            <div className="large-title" style={{ fontSize: 34 }}>Your taste. Your data.</div>
            <p className="subhead mt16" style={{ maxWidth: 300, margin: '16px auto 0' }}>Everything lives only on this device. No account, no signup, no cloud.</p>
          </div>
        )}
        {step === 1 && (
          <div>
            <div className="title-1">Pick the ones you love</div>
            <p className="subhead mt8">Choose at least 5 - more makes your recommendations sharper. Search for anything.</p>
            <PickSearch pool={pool} poolMore={poolMore} map={loved} setMap={setLoved} exclude={disliked} placeholder="Search any movie or show" />
          </div>
        )}
        {step === 2 && (
          <div>
            <div className="title-1">Rate a few</div>
            <p className="subhead mt8">Honest ratings teach Slate what "great" means to you.</p>
            <div className="mt16">
              {lovedArr.map(({ item, rating }) => (
                <div className="cell" key={item.key} style={{ padding: '10px 0' }}>
                  <Poster path={item.posterPath} title={item.title} size="w92" />
                  <div className="cell-main">
                    <div className="cell-title">{item.title}</div>
                    <div className="mt8"><Stars value={rating} onChange={(v) => { const next = new Map(loved); next.set(item.key, { item, rating: v }); setLoved(next); }} /></div>
                  </div>
                </div>
              ))}
              {!lovedArr.length && <p className="footnote">Nothing picked yet - go back and choose a few.</p>}
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <div className="title-1">Anything you can't stand?</div>
            <p className="subhead mt8">Optional, but dislikes are powerful signals.</p>
            <PickSearch pool={pool} poolMore={poolMore} map={disliked} setMap={setDisliked} exclude={loved} placeholder="Search titles you disliked" />
          </div>
        )}
        {step === 4 && (
          <div>
            <div className="title-1">Which would you rather watch?</div>
            <p className="subhead mt8">{pairIdx + 1} of {pairs.length || 1}</p>
            {pairs.length > 0 && pairIdx < pairs.length ? (
              <div className="vs-card mt24">
                {(['a', 'b'] as const).map((side, i) => {
                  const it = pairs[pairIdx][i];
                  return (
                    <button key={side} className="vs-opt" onClick={() => {
                      setPairAnswers((a) => [...a, [pairs[pairIdx][0].key, pairs[pairIdx][1].key, side]]);
                      setPairIdx((p) => p + 1);
                    }}>
                      <Poster path={it.posterPath} title={it.title} />
                      <div className="poster-title center mt8" style={{ fontSize: 13 }}>{it.title}</div>
                    </button>
                  );
                })}
                <div className="vs-vs">or</div>
              </div>
            ) : <p className="footnote mt16 center">Done.</p>}
            {pairs.length > 0 && pairIdx < pairs.length && (
              <div className="center mt16"><button className="btn btn-ghost btn-sm" onClick={() => setPairIdx((p) => p + 1)}>Neither / skip</button></div>
            )}
          </div>
        )}
        {step === 5 && (
          <div>
            <div className="title-1">Where do you stream?</div>
            <p className="subhead mt8">Recommendations prioritize what you can actually watch.</p>
            <div className="row wrap mt16" style={{ gap: 10 }}>
              {providers.map((p) => {
                const on = selProviders.includes(p.id);
                return (
                  <button key={p.id} className={`chip ${on ? 'on' : ''}`} style={{ padding: '8px 12px' }} onClick={() => setSelProviders((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                    {p.logoPath && <img src={logoUrl(p.logoPath, 'w45') ?? ''} width={18} height={18} style={{ borderRadius: 4 }} alt="" />}
                    {p.name}
                  </button>
                );
              })}
              {!providers.length && <p className="footnote">Provider list unavailable offline - you can set this later in Settings.</p>}
            </div>
          </div>
        )}
        {step === 6 && (
          <div>
            <div className="title-1">Tune your taste</div>
            <p className="subhead mt8">These dials shape every recommendation. Change them anytime.</p>
            <div className="mt24">
              <LabeledSlider left="Comforting" right="Dark" value={sliders.comfortingDark} onChange={(v) => setSliders((s) => ({ ...s, comfortingDark: v }))} />
              <LabeledSlider left="Easy" right="Cerebral" value={sliders.easyCerebral} onChange={(v) => setSliders((s) => ({ ...s, easyCerebral: v }))} />
              <LabeledSlider left="Fast paced" right="Slow burn" value={sliders.fastSlow} onChange={(v) => setSliders((s) => ({ ...s, fastSlow: v }))} />
              <LabeledSlider left="Realistic" right="Fantastical" value={sliders.realisticFantastical} onChange={(v) => setSliders((s) => ({ ...s, realisticFantastical: v }))} />
              <LabeledSlider left="Mainstream" right="Obscure" value={sliders.mainstreamObscure} onChange={(v) => setSliders((s) => ({ ...s, mainstreamObscure: v }))} />
            </div>
          </div>
        )}
      </div>
      <div className="row mt16" style={{ gap: 10 }}>
        {step > 0 && <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>Back</button>}
        <div className="grow" />
        {step < 6 && <button className="btn btn-primary" disabled={step === 1 && loved.size < 3} onClick={() => setStep((s) => s + 1)}>{step === 0 ? 'Get started' : 'Continue'}</button>}
        {step === 6 && <button className="btn btn-primary" disabled={saving} onClick={finish}>{saving ? 'Building your profile...' : 'Start watching smarter'}</button>}
      </div>
      {step === 1 && loved.size > 0 && <div className="caption center mt8">{loved.size} picked</div>}
      {step === 0 && <div className="caption center mt8">Free forever. Private by architecture.</div>}
    </div>
  );
}
