import { describe, it, expect } from 'vitest';
import { parseNaturalQuery } from '../src/ui/screens/Search';
import { choosePairs, type PredTitle } from '../src/recommendation/calibrate';
import { makeMeta } from './helpers';

describe('parseNaturalQuery like-clauses', () => {
  it('parses "something like severance"', () => {
    const p = parseNaturalQuery('something like severance');
    expect(p.likeText).toBe('severance');
    expect(p.text).toBe('');
  });
  it('parses "dark shows like true detective"', () => {
    const p = parseNaturalQuery('dark shows like true detective');
    expect(p.likeText).toBe('true detective');
    expect(p.genres).toContain('Crime');
  });
  it('parses "more like the office"', () => {
    expect(parseNaturalQuery('more like the office').likeText).toBe('the office');
  });
  it('leaves plain queries alone', () => {
    const p = parseNaturalQuery('dark 1 season mystery');
    expect(p.likeText).toBeUndefined();
    expect(p.maxSeasons).toBe(1);
    expect(p.text).toBe('mystery');
  });
});

const det = (() => { let i = 0; return () => (i++, (i % 7) / 7); })();

describe('choosePairs adaptive selection', () => {
  const t = (key: string, pred: number, mediaType: 'movie' | 'tv' = 'movie'): PredTitle => ({ t: makeMeta({ key, mediaType }), pred });
  it('prefers close predictions (uncertain pairs) over obvious ones', () => {
    const pool = [t('movie:1', 4.0), t('movie:2', 4.05), t('movie:3', 1.0)];
    const pairs = choosePairs(pool, new Set(), new Map(), 1, det);
    expect(pairs).toHaveLength(1);
    const keys = [pairs[0].a.key, pairs[0].b.key].sort();
    expect(keys).toEqual(['movie:1', 'movie:2']);
  });
  it('never repeats a previously compared pair', () => {
    const pool = [t('movie:1', 4.0), t('movie:2', 4.05)];
    const compared = new Set(['movie:1|movie:2', 'movie:2|movie:1']);
    expect(choosePairs(pool, compared, new Map(), 1, det)).toHaveLength(0);
  });
  it('only pairs within the same media type', () => {
    const pool = [t('movie:1', 4.0), t('tv:2', 4.0, 'tv')];
    expect(choosePairs(pool, new Set(), new Map(), 1, det)).toHaveLength(0);
  });
  it('does not reuse a title within one session', () => {
    const pool = [t('movie:1', 4), t('movie:2', 4), t('movie:3', 4), t('movie:4', 4)];
    const pairs = choosePairs(pool, new Set(), new Map(), 4, det);
    const used = pairs.flatMap((p) => [p.a.key, p.b.key]);
    expect(new Set(used).size).toBe(used.length);
  });
});
