import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLibrary, useTitlesMap } from '../hooks';
import { Segmented, Poster, Empty, Chip } from '../components';
import { buildContext } from '../../recommendation/recommend';
import { scoreCandidate, matchPct } from '../../recommendation/engine';
import { db } from '../../storage/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LibraryEntry, TitleMeta } from '../../data/types';
import { IconChevronR, IconList, IconPlus } from '../icons';
import { createList } from '../../storage/repo';
import { Sheet } from '../components';
import { fmtDate } from '../../data/util';

type Tab = 'watchlist' | 'watching' | 'watched' | 'favorites' | 'lists';
type Sort = 'added' | 'match' | 'shortest' | 'oldest' | 'movies' | 'shows' | 'gems' | 'recent';

export default function Library() {
  const [tab, setTab] = useState<Tab>('watchlist');
  const [sort, setSort] = useState<Sort>('added');
  const nav = useNavigate();
  const all = useLibrary();
  const lists = useLiveQuery(() => db.lists.toArray(), []);
  const listItems = useLiveQuery(() => db.listItems.toArray(), []);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [matchScores, setMatchScores] = useState<Map<string, number>>(new Map());

  const keys = all?.map((e) => e.key);
  const titles = useTitlesMap(keys);

  // compute match % lazily for sorting
  React.useEffect(() => {
    (async () => {
      if (!all || !titles) return;
      try {
        const ctx = await buildContext();
        const m = new Map<string, number>();
        for (const e of all) {
          const meta = titles.get(e.key);
          if (meta && meta.detailLevel === 'full') m.set(e.key, matchPct(scoreCandidate(meta, ctx.model, ctx.settings, ctx.settings.dials).total));
        }
        setMatchScores(m);
      } catch { /* fine */ }
    })();
  }, [all?.length, titles?.size]);

  const entries = useMemo(() => {
    if (!all) return undefined;
    let list: LibraryEntry[] = [];
    if (tab === 'watchlist') list = all.filter((e) => e.status === 'watchlist');
    else if (tab === 'watching') list = all.filter((e) => e.status === 'watching' || e.status === 'paused');
    else if (tab === 'watched') list = all.filter((e) => e.status === 'watched');
    else if (tab === 'favorites') list = all.filter((e) => e.favorite);
    const metaOf = (e: LibraryEntry) => titles?.get(e.key);
    const minutes = (e: LibraryEntry) => { const m = metaOf(e); if (!m) return 99999; return m.mediaType === 'movie' ? (m.runtime ?? 120) : (m.numberOfEpisodes ?? 50) * (m.episodeRuntimes[0] ?? 45); };
    switch (sort) {
      case 'match': list = [...list].sort((a, b) => (matchScores.get(b.key) ?? 0) - (matchScores.get(a.key) ?? 0)); break;
      case 'shortest': list = [...list].sort((a, b) => minutes(a) - minutes(b)); break;
      case 'oldest': list = [...list].sort((a, b) => a.addedAt - b.addedAt); break;
      case 'recent': list = [...list].sort((a, b) => b.addedAt - a.addedAt); break;
      case 'movies': list = list.filter((e) => metaOf(e)?.mediaType === 'movie'); break;
      case 'shows': list = list.filter((e) => metaOf(e)?.mediaType === 'tv'); break;
      case 'gems': list = [...list].filter((e) => (metaOf(e)?.popularity ?? 100) < 80).sort((a, b) => (matchScores.get(b.key) ?? 0) - (matchScores.get(a.key) ?? 0)); break;
      default: list = [...list].sort((a, b) => (b.watchSoon ? 1 : 0) - (a.watchSoon ? 1 : 0) || b.priority - a.priority || b.updatedAt - a.updatedAt);
    }
    return list;
  }, [all, tab, sort, titles, matchScores]);

  const linkOf = (key: string) => { const [m, id] = key.split(':'); return `/title/${m}/${id}`; };

  // watchlist decay: items added > 6 months ago, not watchSoon, low-ish match
  const stale = useMemo(() => {
    if (tab !== 'watchlist' || !entries) return [];
    const sixMonths = 183 * 86400000;
    return entries.filter((e) => Date.now() - e.addedAt > sixMonths && !e.watchSoon && (matchScores.get(e.key) ?? 100) < 75);
  }, [entries, tab, matchScores]);

  return (
    <div>
      <div className="topbar"><div className="topbar-row">
        <div className="large-title">Library</div>
        {tab === 'lists' && <button className="iconbtn" onClick={() => setNewListOpen(true)} aria-label="New list"><IconPlus /></button>}
      </div></div>
      <div style={{ padding: '0 16px' }}>
        <Segmented value={tab} onChange={(t) => setTab(t as Tab)} options={[
          { value: 'watchlist', label: 'Watchlist' }, { value: 'watching', label: 'Watching' },
          { value: 'watched', label: 'Watched' }, { value: 'favorites', label: 'Favorites' }, { value: 'lists', label: 'Lists' }
        ]} />
      </div>

      {tab === 'watchlist' && (
        <div className="chip-row mt8">
          {([['added', 'Watch Soon'], ['match', 'Highest Match'], ['shortest', 'Shortest'], ['movies', 'Movies'], ['shows', 'Shows'], ['gems', 'Hidden Gems'], ['recent', 'Recently Added'], ['oldest', 'Oldest Saved']] as [Sort, string][]).map(([v, l]) => (
            <Chip key={v} label={l} on={sort === v} onClick={() => setSort(v)} />
          ))}
        </div>
      )}

      {tab === 'watchlist' && entries && entries.length >= 5 && (
        <div style={{ padding: '4px 16px 0' }}>
          <Link to="/triage" className="btn btn-secondary btn-block"><IconList /> Triage your backlog</Link>
        </div>
      )}

      {tab === 'watchlist' && stale.length > 0 && (
        <div className="section" style={{ padding: '0 16px' }}>
          <div className="card card-pad" style={{ borderColor: 'var(--hairline-strong)' }}>
            <div className="headline">Gathering dust</div>
            <div className="footnote mt8">{stale.length} title{stale.length === 1 ? '' : 's'} saved over 6 months ago. Triage can help you decide: watch soon, keep, or let go.</div>
            <Link to="/triage" className="btn btn-secondary btn-sm mt16">Review them</Link>
          </div>
        </div>
      )}

      {tab !== 'lists' && (
        <div className="section" style={{ marginTop: 12 }}>
          {entries === undefined && <div style={{ padding: 16 }} className="skeleton" />}
          {entries?.map((e) => {
            const m = titles?.get(e.key);
            return (
              <Link key={e.key} to={linkOf(e.key)} className="cell">
                <Poster path={m?.posterPath} title={m?.title ?? e.key} size="w154" />
                <div className="cell-main">
                  <div className="cell-title">{m?.title ?? 'Loading...'}</div>
                  <div className="cell-sub">
                    {m?.mediaType === 'movie' ? 'Movie' : 'Series'}{m?.year ? ` · ${m.year}` : ''}
                    {e.rating !== undefined ? ` · You: ${e.rating}` : ''}
                    {tab === 'watchlist' && matchScores.get(e.key) ? ` · ${matchScores.get(e.key)}% match` : ''}
                  </div>
                  {tab === 'watchlist' && e.addedAt && <div className="caption">Saved {fmtDate(new Date(e.addedAt).toISOString().slice(0, 10))}{e.notes ? ` · ${e.notes}` : ''}</div>}
                </div>
                {e.watchSoon && <span className="badge">Soon</span>}
                {e.priority > 0 && <span className="badge">P{e.priority}</span>}
              </Link>
            );
          })}
          {entries && entries.length === 0 && (
            <Empty title={tab === 'watchlist' ? 'Watchlist is empty' : tab === 'watching' ? 'Nothing in progress' : tab === 'watched' ? 'No watched titles yet' : 'No favorites yet'}
              body="Use Search or Discover to find something worth your time."
              action={<Link to="/discover" className="btn btn-primary">Discover</Link>} />
          )}
        </div>
      )}

      {tab === 'lists' && (
        <div className="section" style={{ marginTop: 12 }}>
          {(lists ?? []).map((l) => {
            const count = (listItems ?? []).filter((i) => i.listId === l.id).length;
            const cover = (listItems ?? []).find((i) => i.listId === l.id)?.key;
            const coverMeta = cover ? titles?.get(cover) : undefined;
            return (
              <Link key={l.id} to={`/lists/${l.id}`} className="cell">
                <Poster path={coverMeta?.posterPath} title={l.name} size="w154" />
                <div className="cell-main">
                  <div className="cell-title">{l.name}</div>
                  <div className="cell-sub">{count} title{count === 1 ? '' : 's'}{l.notes ? ` · ${l.notes}` : ''}</div>
                </div>
                <IconChevronR />
              </Link>
            );
          })}
          {lists && lists.length === 0 && <Empty title="No lists yet" body="Make one for anything: weekend picks, watch with friends, favorite finales." action={<button className="btn btn-primary" onClick={() => setNewListOpen(true)}>New list</button>} />}
        </div>
      )}

      <Sheet open={newListOpen} onClose={() => setNewListOpen(false)} title="New list">
        <div className="field"><label>Name</label><input className="input" value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Weekend watch" autoFocus /></div>
        <button className="btn btn-primary btn-block" disabled={!newListName.trim()} onClick={async () => {
          const id = await createList(newListName.trim());
          setNewListOpen(false); setNewListName('');
          nav(`/lists/${id}`);
        }}>Create</button>
      </Sheet>
    </div>
  );
}
