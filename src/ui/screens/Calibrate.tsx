import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pickCalibrationPairs, recordCalibration, type CalPair } from '../../recommendation/calibrate';
import { Poster, Empty } from '../components';
import { useToast } from '../components';
import { IconChevronL } from '../icons';

export default function Calibrate() {
  const [pairs, setPairs] = useState<CalPair[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(0);
  const toast = useToast();

  useEffect(() => { pickCalibrationPairs(8).then(setPairs).catch(() => setPairs([])); }, []);

  const answer = async (winner: 'a' | 'b' | 'skip') => {
    if (!pairs || idx >= pairs.length) return;
    const p = pairs[idx];
    if (winner !== 'skip') {
      await recordCalibration(p.a.key, p.b.key, winner);
      setAnswered((n) => n + 1);
    }
    setIdx((i) => i + 1);
  };

  const done = pairs !== null && idx >= pairs.length;

  return (
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div className="topbar"><div className="topbar-row">
        <Link to="/profile" className="iconbtn plain" aria-label="Back"><IconChevronL /></Link>
        <div className="title-1" style={{ fontSize: 20 }}>Taste calibration</div>
        <div style={{ width: 38 }} />
      </div></div>
      <div style={{ padding: '0 16px' }}>
        <p className="subhead mt8">Quick either/or choices that sharpen every recommendation. Pairs are picked where your taste model is least certain.</p>
        {pairs === null && <div className="center" style={{ padding: 48 }}><div className="skeleton" style={{ height: 240, borderRadius: 14 }} /></div>}
        {pairs !== null && pairs.length === 0 && (
          <Empty title="Nothing to calibrate yet" body="Open and rate a few titles first - Slate needs some signal before it can find uncertain pairs." />
        )}
        {pairs && !done && pairs.length > 0 && (
          <>
            <p className="footnote mt16">{idx + 1} of {pairs.length} - which would you rather watch?</p>
            <div className="vs-card mt16">
              {(['a', 'b'] as const).map((side) => {
                const it = pairs[idx][side];
                return (
                  <button key={side} className="vs-opt" onClick={() => void answer(side)}>
                    <Poster path={it.posterPath} title={it.title} />
                    <div className="poster-title center mt8" style={{ fontSize: 13 }}>{it.title}</div>
                    <div className="caption center">{it.year ?? ''}</div>
                  </button>
                );
              })}
              <div className="vs-vs">or</div>
            </div>
            <div className="center mt16"><button className="btn btn-ghost btn-sm" onClick={() => void answer('skip')}>Neither / skip</button></div>
          </>
        )}
        {done && pairs.length > 0 && (
          <div className="card card-pad mt24 center">
            <div className="title-2">Taste model updated</div>
            <p className="subhead mt8">{answered} new signal{answered === 1 ? '' : 's'} folded in. Recommendations and Tonight picks already reflect it.</p>
            <button className="btn btn-secondary btn-block mt16" onClick={() => { setPairs(null); setIdx(0); setAnswered(0); pickCalibrationPairs(8).then(setPairs); }}>Keep going</button>
            <Link to="/profile" className="btn btn-ghost btn-block mt8" style={{ display: 'block', textDecoration: 'none' }}>Done</Link>
          </div>
        )}
      </div>
    </div>
  );
}
