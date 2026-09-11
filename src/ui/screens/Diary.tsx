import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../storage/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTitlesMap } from '../hooks';
import { Segmented, Poster, Empty, Stars } from '../components';
import { fmtDate } from '../../data/util';
import { deleteDiary } from '../../storage/repo';
import { IconTrash } from '../icons';
import { useToast } from '../components';

type View = 'chronological' | 'calendar' | 'monthly' | 'yearly';

export default function Diary() {
  const [view, setView] = useState<View>('chronological');
  const diary = useLiveQuery(() => db.diary.orderBy('date').reverse().toArray(), []);
  const titles = useTitlesMap(diary?.map((d) => d.key));
  const toast = useToast();
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });

  const byDay = useMemo(() => {
    const m = new Map<string, typeof diary>();
    for (const d of diary ?? []) m.set(d.date, [...(m.get(d.date) ?? []), d]);
    return m;
  }, [diary]);

  const byMonth = useMemo(() => {
    const m = new Map<string, typeof diary>();
    for (const d of diary ?? []) { const k = d.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [diary]);

  const byYear = useMemo(() => {
    const m = new Map<string, typeof diary>();
    for (const d of diary ?? []) { const k = d.date.slice(0, 4); m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [diary]);

  const calDays = useMemo(() => {
    const [y, mo] = calMonth.split('-').map(Number);
    const first = new Date(y, mo - 1, 1);
    const days = new Date(y, mo, 0).getDate();
    const cells: ({ day: number; count: number } | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const key = `${calMonth}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, count: byDay.get(key)?.length ?? 0 });
    }
    return cells;
  }, [calMonth, byDay]);

  const linkOf = (key: string) => { const [m, id] = key.split(':'); return `/title/${m}/${id}`; };

  return (
    <div>
      <div className="topbar"><div className="topbar-row"><div className="large-title">Diary</div></div></div>
      <div style={{ padding: '0 16px' }}>
        <Segmented value={view} onChange={(v) => setView(v as View)} options={[{ value: 'chronological', label: 'Timeline' }, { value: 'calendar', label: 'Calendar' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
      </div>

      {view === 'chronological' && (
        <div className="section" style={{ marginTop: 12 }}>
          {(diary ?? []).map((d) => {
            const m = titles?.get(d.key);
            return (
              <div key={d.id} className="cell">
                <Link to={linkOf(d.key)}><Poster path={m?.posterPath} title={m?.title ?? ''} size="w154" /></Link>
                <div className="cell-main">
                  <Link to={linkOf(d.key)} className="cell-title">{m?.title ?? d.key}</Link>
                  <div className="cell-sub">{fmtDate(d.date)}{d.season ? ` · S${d.season} E${d.episode}` : ''}{d.rewatch ? ' · Rewatch' : ''}</div>
                  {d.rating !== undefined && <div className="mt8"><Stars value={d.rating} readOnly size="sm" /></div>}
                  {d.review && <div className="footnote mt8" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.review}</div>}
                </div>
                <button className="iconbtn plain" aria-label="Delete entry" onClick={async () => { await deleteDiary(d.id!); toast('Diary entry deleted'); }}><IconTrash /></button>
              </div>
            );
          })}
          {diary && diary.length === 0 && <Empty title="Your diary is empty" body="Log what you watch from any title page and it lands here." />}
        </div>
      )}

      {view === 'calendar' && (
        <div className="section" style={{ padding: '0 16px' }}>
          <div className="spread mt8">
            <button className="btn btn-ghost btn-sm" onClick={() => { const [y, m] = calMonth.split('-').map(Number); const d = new Date(y, m - 2, 1); setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }}>Prev</button>
            <div className="headline">{new Date(Number(calMonth.split('-')[0]), Number(calMonth.split('-')[1]) - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { const [y, m] = calMonth.split('-').map(Number); const d = new Date(y, m, 1); setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }}>Next</button>
          </div>
          <div className="cal-grid mt16">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="cal-day caption">{d}</div>)}
            {calDays.map((c, i) => (
              <div key={i} className={`cal-day ${c?.count ? 'has' : ''}`}>{c?.day ?? ''}{c && c.count > 0 && <span className="cal-n num">{c.count}</span>}</div>
            ))}
          </div>
        </div>
      )}

      {view === 'yearly' && (
        <div className="section" style={{ padding: '0 16px' }}>
          {byYear.map(([year, arr]) => {
            const rated = arr!.filter((d) => d.rating);
            return (
              <div key={year} className="card card-pad mt8">
                <div className="spread">
                  <div className="headline">{year}</div>
                  <Link to={`/year/${year}`} className="btn btn-ghost btn-sm">Year in Review</Link>
                </div>
                <div className="footnote mt8 num">
                  {arr!.length} entr{arr!.length === 1 ? 'y' : 'ies'} · {arr!.filter((d) => d.mediaType === 'movie').length} movies · {arr!.filter((d) => d.mediaType === 'tv').length} episodes
                  {rated.length ? ` · avg ${(rated.reduce((a, d) => a + (d.rating ?? 0), 0) / rated.length).toFixed(1)}` : ''}
                </div>
              </div>
            );
          })}
          {diary && diary.length === 0 && <Empty title="Nothing logged yet" />}
        </div>
      )}

      {view === 'monthly' && (
        <div className="section" style={{ padding: '0 16px' }}>
          {byMonth.map(([month, arr]) => (
            <div key={month} className="card card-pad mt8">
              <div className="spread">
                <div className="headline">{new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
                <div className="footnote num">{arr!.length} entr{arr!.length === 1 ? 'y' : 'ies'}</div>
              </div>
              <div className="footnote mt8 num">
                {arr!.filter((d) => d.mediaType === 'movie').length} movies · {arr!.filter((d) => d.mediaType === 'tv').length} episodes
                {arr!.some((d) => d.rating) ? ` · avg ${(arr!.filter((d) => d.rating).reduce((a, d) => a + (d.rating ?? 0), 0) / arr!.filter((d) => d.rating).length).toFixed(1)}` : ''}
              </div>
            </div>
          ))}
          {diary && diary.length === 0 && <Empty title="Nothing logged yet" />}
        </div>
      )}
    </div>
  );
}
