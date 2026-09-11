import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSeason, type SeasonDetail as SD } from '../../providers/tmdb';
import { getProgress, markEpisode, markSeason, getEntry } from '../../storage/repo';
import { useEntry, useOnline } from '../hooks';
import { updateEntry } from '../../storage/repo';
import { addDiary } from '../../storage/repo';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../storage/db';
import { fmtDate, today } from '../../data/util';
import { IconCheck, IconChevronL } from '../icons';
import { Empty, Stars, useToast } from '../components';

export default function SeasonDetail() {
  const { id, season } = useParams<{ id: string; season: string }>();
  const tmdbId = Number(id); const seasonNum = Number(season);
  const key = `tv:${tmdbId}`;
  const [data, setData] = useState<SD | null>(null);
  const [error, setError] = useState(false);
  const entry = useEntry(key);
  const online = useOnline();
  const toast = useToast();
  const progress = useLiveQuery(() => getProgress(key), [key]);

  useEffect(() => {
    getSeason(tmdbId, seasonNum).then(setData).catch(() => setError(true));
  }, [tmdbId, seasonNum, online]);

  const watchedCount = data?.episodes.filter((e) => progress?.episodes[`${e.seasonNumber}:${e.episodeNumber}`]).length ?? 0;

  const toggleEp = async (seasonN: number, ep: number, watched: boolean) => {
    await markEpisode(key, seasonN, ep, watched);
    if (watched) {
      const cur = await getEntry(key);
      if (cur.status !== 'watching' && cur.status !== 'watched') await updateEntry(key, { status: 'watching' });
      await addDiary({ key, mediaType: 'tv', date: today(), season: seasonN, episode: ep, rewatch: false });
    }
  };

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="topbar"><div className="topbar-row">
        <Link to={`/title/tv/${tmdbId}`} className="iconbtn plain" aria-label="Back"><IconChevronL /></Link>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="headline" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data?.name ?? `Season ${seasonNum}`}</div>
          {data && progress && <div className="caption num">{watchedCount} of {data.episodes.length} watched</div>}
        </div>
        {data && <button className="btn btn-ghost btn-sm" onClick={async () => {
          const all = watchedCount === data.episodes.length;
          await markSeason(key, seasonNum, data.episodes.length, !all);
          if (!all) { await updateEntry(key, { status: 'watching' }); toast('Season marked watched'); }
        }}>{watchedCount === data.episodes.length ? 'Unmark all' : 'Mark season'}</button>}
      </div></div>
      {!data && !error && <div style={{ padding: 16 }}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 10 }} />)}</div>}
      {error && <Empty title="Season unavailable" body={online ? 'Could not load this season.' : 'You are offline and this season is not cached.'} />}
      <div>
        {data?.episodes.map((e) => {
          const watched = !!progress?.episodes[`${e.seasonNumber}:${e.episodeNumber}`];
          return (
            <div key={e.episodeNumber} className="ep-row">
              {e.stillPath ? <img className="ep-still" src={`https://image.tmdb.org/t/p/w185${e.stillPath}`} alt="" loading="lazy" /> : <div className="ep-still" />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="headline" style={{ fontSize: 15 }}>{e.episodeNumber}. {e.name}</div>
                <div className="caption">{e.airDate ? fmtDate(e.airDate) : 'Unaired'}{e.runtime ? ` · ${e.runtime}m` : ''}</div>
                {e.overview && <div className="footnote" style={{ marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.overview}</div>}
              </div>
              <button className={`ep-check ${watched ? 'on' : ''}`} aria-label={watched ? `Mark episode ${e.episodeNumber} unwatched` : `Mark episode ${e.episodeNumber} watched`}
                onClick={() => toggleEp(e.seasonNumber, e.episodeNumber, !watched)}>
                {watched && <IconCheck />}
              </button>
            </div>
          );
        })}
      </div>
      {data && data.episodes.length === 0 && <Empty title="No episodes listed" body="This season may not have aired yet." />}
    </div>
  );
}
