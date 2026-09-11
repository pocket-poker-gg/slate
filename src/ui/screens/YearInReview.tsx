import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../../storage/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { computeYearStats, type YearStats } from '../../analytics/stats';
import { posterUrl } from '../../data/config';
import { Empty } from '../components';

export default function YearInReview() {
  const { year: yearParam } = useParams<{ year: string }>();
  const year = Number(yearParam) || new Date().getFullYear();
  const diary = useLiveQuery(() => db.diary.toArray(), []);
  const library = useLiveQuery(() => db.library.toArray(), []);
  const titles = useLiveQuery(() => db.titles.toArray(), []);
  const titlesMap = useMemo(() => new Map((titles ?? []).map((t) => [t.key, t])), [titles]);
  const [stats, setStats] = useState<YearStats | null>(null);

  useEffect(() => {
    if (diary && library && titles) setStats(computeYearStats(year, library, diary, titlesMap));
  }, [diary, library, titles, year]);

  if (!stats) return null;
  if (stats.moviesWatched + stats.episodesWatched === 0) {
    return <div className="page"><Empty title={`Nothing logged in ${year} yet`} body="Diary entries power your year in review." action={<Link to="/" className="btn btn-primary">Home</Link>} /></div>;
  }

  const favoriteMeta = stats.favoriteMovie ? titlesMap.get(stats.favoriteMovie.key) : stats.favoriteShow ? titlesMap.get(stats.favoriteShow.key) : undefined;

  return (
    <div className="page" style={{ textAlign: 'center' }}>
      <div style={{ paddingTop: 40 }}>
        <div className="caption" style={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}>Slate Wrapped</div>
        <div className="large-title" style={{ fontSize: 54, letterSpacing: '-0.03em' }}>{year}</div>
      </div>
      {favoriteMeta?.posterPath && (
        <img src={posterUrl(favoriteMeta.posterPath, 'w342') ?? ''} alt={favoriteMeta.title} style={{ width: 150, borderRadius: 14, margin: '26px auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
      )}
      <div className="card card-pad" style={{ textAlign: 'left' }}>
        <div className="spread"><span className="subhead">Hours watched</span><span className="stat-big num" style={{ fontSize: 26 }}>{stats.hoursWatched}h</span></div>
        <div className="divider" />
        <div className="spread"><span className="subhead">Movies</span><span className="body num">{stats.moviesWatched}</span></div>
        <div className="spread mt8"><span className="subhead">Episodes</span><span className="body num">{stats.episodesWatched}</span></div>
        <div className="spread mt8"><span className="subhead">Rewatches</span><span className="body num">{stats.rewatches}</span></div>
        {stats.averageRating && <div className="spread mt8"><span className="subhead">Average rating</span><span className="body num">{stats.averageRating}</span></div>}
      </div>
      <div className="card card-pad mt16" style={{ textAlign: 'left' }}>
        {stats.favoriteMovie && <div className="spread"><span className="subhead">Favorite movie</span><Link className="body" to={`/title/movie/${stats.favoriteMovie.key.split(':')[1]}`} style={{ textDecoration: 'underline' }}>{stats.favoriteMovie.title}</Link></div>}
        {stats.favoriteShow && <div className="spread mt8"><span className="subhead">Favorite show</span><Link className="body" to={`/title/tv/${stats.favoriteShow.key.split(':')[1]}`} style={{ textDecoration: 'underline' }}>{stats.favoriteShow.title}</Link></div>}
        {stats.topGenres[0] && <div className="spread mt8"><span className="subhead">Top genre</span><span className="body">{stats.topGenres[0].name}</span></div>}
        {stats.topActors[0] && <div className="spread mt8"><span className="subhead">Top actor</span><span className="body">{stats.topActors[0].name}</span></div>}
        {stats.topCreators[0] && <div className="spread mt8"><span className="subhead">Top creator</span><span className="body">{stats.topCreators[0].name}</span></div>}
        {stats.biggestBinge && <div className="spread mt8"><span className="subhead">Biggest binge</span><span className="body">{stats.biggestBinge.episodes} eps of {stats.biggestBinge.title}</span></div>}
        {stats.mostActiveMonth && <div className="spread mt8"><span className="subhead">Most active month</span><span className="body">{stats.mostActiveMonth.month}</span></div>}
      </div>
      {stats.ratingsDistribution.length > 0 && (
        <div className="card card-pad mt16" style={{ textAlign: 'left' }}>
          <div className="headline" style={{ marginBottom: 10 }}>Your ratings</div>
          {stats.ratingsDistribution.map((d) => (
            <div key={d.stars} className="dna-row">
              <span className="dna-name num">{d.stars}</span>
              <div className="progressbar"><div style={{ width: `${(d.count / Math.max(...stats.ratingsDistribution.map((x) => x.count))) * 100}%` }} /></div>
              <span className="caption num" style={{ width: 26, textAlign: 'right' }}>{d.count}</span>
            </div>
          ))}
        </div>
      )}
      <div className="caption mt24">Computed entirely on this device.</div>
      <div style={{ height: 40 }} />
    </div>
  );
}
