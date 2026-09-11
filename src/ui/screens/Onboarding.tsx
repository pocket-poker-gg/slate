import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { popular, topRated, listWatchProviders, type SearchResultItem, type WatchProviderOption } from '../../providers/tmdb';
import { db } from '../../storage/db';
import { updateEntry, saveSettings, getSettings } from '../../storage/repo';
import { posterUrl, logoUrl } from '../../data/config';
import { DEFAULT_SLIDERS, type SliderSet } from '../../data/types';
import { LabeledSlider, Poster, Stars } from '../components';

type PickedMap = Map<string, { item: SearchResultItem; rating?: number }>;

export default function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [pool, setPool] = useState<SearchResultItem[]>([]);
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
      try {
        const [pm, pt, tm, tt] = await Promise.all([popular('movie'), popular('tv'), topRated('movie'), topRated('tv')]);
        const seen = new Set<string>();
        const merged = [...pm, ...pt, ...tm, ...tt].filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
        setPool(merged);
        const shuffled = [...merged].sort(() => 0.5 - Math.random());
        const ps: [SearchResultItem, SearchResultItem][] = [];
        for (let i = 0; i + 1 < shuffled.length && ps.length < 5; i += 2) ps.push([shuffled[i], shuffled[i + 1]]);
        setPairs(ps);
      } catch { /* offline onboarding handled below */ }
      try { setProviders((await listWatchProviders('US')).slice(0, 40)); } catch { /* offline */ }
    })();
  }, []);

  const steps = ['Welcome', 'Love', 'Rate', 'Dislike', 'Versus', 'Streaming', 'Taste'];
  const toggle = (map: PickedMap, setMap: (m: PickedMap) => void, item: SearchResultItem) => {
    const next = new Map(map);
    if (next.has(item.key)) next.delete(item.key); else next.set(item.key, { item });
    setMap(next);
  };

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

  const PosterPick = ({ item, map, setMap }: { item: SearchResultItem; map: PickedMap; setMap: (m: PickedMap) => void }) => {
    const on = map.has(item.key);
    return (
      <button onClick={() => toggle(map, setMap, item)} style={{ textAlign: 'left', position: 'relative' }}>
        <Poster path={item.posterPath} title={item.title} size="w342" />
        {on && <div style={{ position: 'absolute', inset: 0, borderRadius: 10, outline: '3px solid var(--accent)', outlineOffset: -1.5, background: 'rgba(255,255,255,0.08)' }} />}
        <div className="poster-title" style={{ fontSize: 12, marginTop: 6 }}>{item.title}</div>
        <div className="caption">{item.year ?? ''}</div>
      </button>
    );
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
            <p className="subhead mt8">Choose at least 5 - more makes your recommendations sharper.</p>
            {pool.length === 0 ? <p className="footnote mt16">Loading titles... if you are offline, skip ahead - you can always rate titles later.</p> : (
              <div className="poster-grid mt16">{pool.slice(0, 36).map((i) => <PosterPick key={i.key} item={i} map={loved} setMap={setLoved} />)}</div>
            )}
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
            <div className="poster-grid mt16">{pool.filter((i) => !loved.has(i.key)).slice(0, 24).map((i) => <PosterPick key={i.key} item={i} map={disliked} setMap={setDisliked} />)}</div>
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
