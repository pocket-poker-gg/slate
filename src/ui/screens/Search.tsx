import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchMulti, trending, type SearchResults } from '../../providers/tmdb';
import { pushSearchHistory, getSettings } from '../../storage/repo';
import { db } from '../../storage/db';
import { posterUrl } from '../../data/config';
import { useOnline, useSettings } from '../hooks';
import { IconSearch, IconX, IconFilm, IconTv } from '../icons';
import { Empty } from '../components';

const MOOD_WORDS: Record<string, string[]> = {
  dark: ['Crime', 'Thriller', 'Horror', 'Mystery'],
  funny: ['Comedy'],
  scary: ['Horror'],
  romantic: ['Romance'],
  thrilling: ['Thriller'],
  cerebral: ['Mystery', 'Science Fiction'],
  comforting: ['Comedy', 'Family', 'Animation'],
  animated: ['Animation']
};

interface ParsedQuery { text: string; genres: string[]; maxSeasons?: number; maxMinutes?: number; likeKey?: string }

export function parseNaturalQuery(q: string): ParsedQuery {
  let text = q.toLowerCase();
  const genres: string[] = [];
  let maxSeasons: number | undefined;
  let maxMinutes: number | undefined;
  const seasonMatch = text.match(/(\d+)\s*seasons?/);
  if (seasonMatch) { maxSeasons = Number(seasonMatch[1]); text = text.replace(seasonMatch[0], ' '); }
  const minMatch = text.match(/(\d+)\s*m(in(ute)?s?)?\b/);
  if (minMatch && Number(minMatch[1]) >= 40) { maxMinutes = Number(minMatch[1]); text = text.replace(minMatch[0], ' '); }
  for (const [word, gs] of Object.entries(MOOD_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) { genres.push(...gs); text = text.replace(new RegExp(`\\b${word}\\b`, 'g'), ' '); }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), genres, maxSeasons, maxMinutes };
}

export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [trendingItems, setTrendingItems] = useState<SearchResults['items']>([]);
  const [tab, setTab] = useState<'all' | 'movie' | 'tv'>('all');
  const online = useOnline();
  const settings = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    trending('all').then(setTrendingItems).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const parsed = parseNaturalQuery(q);
        const r = await searchMulti(parsed.text || q);
        let items = r.items;
        if (parsed.genres.length) {
          const metas = await db.titles.bulkGet(items.map((i) => i.key));
          items = items.filter((it, i) => {
            const names = metas[i]?.genreNames ?? [];
            return names.some((g) => parsed.genres.includes(g));
          });
        }
        setResults({ ...r, items });
        void pushSearchHistory(q.trim());
      } catch { setResults({ items: [], people: [], totalResults: 0 }); }
      setSearching(false);
    }, 280);
    return () => clearTimeout(timer.current);
  }, [q]);

  const shown = useMemo(() => {
    const src = q.trim() ? (results?.items ?? []) : trendingItems;
    return tab === 'all' ? src : src.filter((i) => i.mediaType === tab);
  }, [q, results, trendingItems, tab]);

  return (
    <div>
      <div className="searchbar">
        <span className="search-icon"><IconSearch /></span>
        <input ref={inputRef} className="input" placeholder="Shows, movies, people - or try &quot;dark 1 season mystery&quot;" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      <div className="chip-row">
        {(['all', 'movie', 'tv'] as const).map((t) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t === 'movie' ? 'Movies' : t === 'tv' ? 'Shows' : 'All'}
          </button>
        ))}
      </div>

      {!q.trim() && (settings?.searchHistory?.length ?? 0) > 0 && (
        <div className="section">
          <div className="section-head"><span className="title-2">Recent</span></div>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {settings!.searchHistory.map((h) => <button key={h} className="chip" onClick={() => setQ(h)}>{h}</button>)}
          </div>
        </div>
      )}

      <div className="section" style={{ marginTop: 10 }}>
        {!q.trim() && <div className="section-head"><span className="title-2">Trending</span></div>}
        {shown.map((i) => (
          <Link key={i.key} to={`/title/${i.mediaType}/${i.tmdbId}`} className="cell">
            <div className="poster">{i.posterPath && <img src={posterUrl(i.posterPath, 'w92') ?? ''} alt="" loading="lazy" />}</div>
            <div className="cell-main">
              <div className="cell-title">{i.title}</div>
              <div className="cell-sub row" style={{ gap: 6 }}>
                {i.mediaType === 'movie' ? <IconFilm /> : <IconTv />}
                <span>{i.year ?? ''}{i.voteAverage ? ` · ${i.voteAverage.toFixed(1)}` : ''}</span>
              </div>
            </div>
          </Link>
        ))}
        {q.trim() && results && shown.length === 0 && !searching && (
          <Empty title="No matches" body={online ? 'Try different words, or fewer filters.' : 'You appear to be offline - search needs a connection.'} />
        )}
        {q.trim() && searching && <div style={{ padding: 16 }}>{[0, 1, 2].map((i) => <div key={i} className="cell"><div className="skeleton" style={{ width: 56, height: 84, borderRadius: 7 }} /><div className="grow"><div className="skeleton" style={{ height: 15, width: '60%' }} /><div className="skeleton mt8" style={{ height: 12, width: '35%' }} /></div></div>)}</div>}
        {q.trim() && (results?.people.length ?? 0) > 0 && (
          <>
            <div className="section-head mt16"><span className="title-2">People</span></div>
            {results!.people.slice(0, 5).map((p) => (
              <div key={p.id} className="cell">
                <div className="poster" style={{ borderRadius: '50%', width: 48, aspectRatio: '1' }}>{p.profilePath && <img src={posterUrl(p.profilePath, 'w92') ?? ''} alt="" style={{ borderRadius: '50%' }} />}</div>
                <div className="cell-main"><div className="cell-title">{p.name}</div><div className="cell-sub">{p.knownFor ?? ''}</div></div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
