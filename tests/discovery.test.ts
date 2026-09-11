import { describe, it, expect } from 'vitest';
import {
  discoverQueryFor, summaryScore, rankDiscover, diversify, isDiscoverable,
  feedTagline, isGem, genreNamesFor, type SummaryScore
} from '../src/recommendation/discovery';
import { DEFAULT_DIALS, type LibraryEntry } from '../src/data/types';
import type { SearchResultItem } from '../src/providers/tmdb';
import { buildTasteModel } from '../src/recommendation/taste';
import { makeMeta, makeEntry } from './helpers';

const item = (key: string, over: Partial<SearchResultItem> = {}): SearchResultItem => ({
  key, tmdbId: Number(key.split(':')[1]), mediaType: key.split(':')[0] as 'movie' | 'tv',
  title: key, genreIds: [], ...over
});

// model that loves crime/drama, dislikes comedy
const crimeLover = buildTasteModel(
  [
    makeEntry({ key: 'movie:1', rating: 5 }),
    makeEntry({ key: 'movie:2', rating: 0.5 })
  ],
  new Map([
    ['movie:1', makeMeta({ key: 'movie:1', genreNames: ['Crime', 'Drama'], genres: [80, 18] })],
    ['movie:2', makeMeta({ key: 'movie:2', genreNames: ['Comedy'], genres: [35] })]
  ]),
  new Map(),
  [{ aKey: 'movie:1', bKey: 'movie:2', winner: 'a' as const, at: Date.now() }, { aKey: 'movie:1', bKey: 'movie:2', winner: 'a' as const, at: Date.now() }],
  [], undefined as any
);

describe('dial-driven query mapping', () => {
  const base = { mediaType: 'movie' as const };
  it('popular end forces popularity sort with a high vote floor', () => {
    const q = discoverQueryFor(base, { ...DEFAULT_DIALS, popularHidden: 0 }, 1);
    expect(q.sort).toBe('popularity.desc');
    expect(q.voteCountGte).toBeGreaterThanOrEqual(500);
  });
  it('hidden end switches to best-rated with a low vote floor - genuinely different results', () => {
    const q = discoverQueryFor(base, { ...DEFAULT_DIALS, popularHidden: 1 }, 1);
    expect(q.sort).toBe('vote_average.desc');
    expect(q.voteCountGte).toBeLessThanOrEqual(100);
  });
  it('impatient end caps movie runtime in the request', () => {
    const q = discoverQueryFor(base, { ...DEFAULT_DIALS, immediateSlowburn: 0 }, 1);
    expect(q.runtimeLte).toBeLessThanOrEqual(110);
  });
  it('filters and page pass through', () => {
    const q = discoverQueryFor({ mediaType: 'tv', genres: [18], minRating: 7, decade: 2010, miniseries: true, language: 'ko' }, DEFAULT_DIALS, 4);
    expect(q).toMatchObject({ mediaType: 'tv', page: 4, genres: [18], voteGte: 7, yearGte: 2010, yearLte: 2019, tvType: 2, language: 'ko' });
  });
});

describe('summary-level scoring', () => {
  it('scores every card from summary data - no hydration required', () => {
    const crime = item('movie:10', { genreIds: [80, 18], voteAverage: 8.1, voteCount: 5000, popularity: 40 });
    const comedy = item('movie:11', { genreIds: [35], voteAverage: 8.1, voteCount: 5000, popularity: 40 });
    const sCrime = summaryScore(crime, crimeLover, DEFAULT_DIALS, 'day1');
    const sComedy = summaryScore(comedy, crimeLover, DEFAULT_DIALS, 'day1');
    expect(sCrime.total).toBeGreaterThan(sComedy.total + 0.1);
    expect(sCrime.pct).toBeGreaterThan(sComedy.pct);
  });
  it('dials move the score in the expected direction', () => {
    const dark = item('movie:20', { genreIds: [27, 53], voteAverage: 7.5, voteCount: 900, popularity: 12 });
    const light = item('movie:21', { genreIds: [35, 10751], voteAverage: 7.5, voteCount: 900, popularity: 12 });
    const darkDials = { ...DEFAULT_DIALS, lightDark: 1 };
    expect(summaryScore(dark, crimeLover, darkDials, 'd').total).toBeGreaterThan(summaryScore(light, crimeLover, darkDials, 'd').total);
    const obscure = item('movie:22', { genreIds: [18], voteAverage: 7.9, voteCount: 300, popularity: 2 });
    const famous = item('movie:23', { genreIds: [18], voteAverage: 7.9, voteCount: 300000, popularity: 900 });
    const hiddenDials = { ...DEFAULT_DIALS, popularHidden: 1 };
    expect(summaryScore(obscure, crimeLover, hiddenDials, 'd').total).toBeGreaterThan(summaryScore(famous, crimeLover, hiddenDials, 'd').total);
  });
  it('a fresh (empty) model degrades to a quality-driven neutral ranking', () => {
    const fresh = buildTasteModel([], new Map(), new Map(), [], [], undefined as any);
    const good = item('movie:30', { genreIds: [18], voteAverage: 8.5, voteCount: 50000, popularity: 100 });
    const bad = item('movie:31', { genreIds: [18], voteAverage: 4.2, voteCount: 60, popularity: 100 });
    expect(summaryScore(good, fresh, DEFAULT_DIALS, 'd').total).toBeGreaterThan(summaryScore(bad, fresh, DEFAULT_DIALS, 'd').total);
  });
});

describe('ranking, gems, diversity, exclusions', () => {
  const items = [
    item('movie:40', { genreIds: [28], voteAverage: 7.2, voteCount: 90000, popularity: 500 }),
    item('movie:41', { genreIds: [18], voteAverage: 8.4, voteCount: 3000, popularity: 9 }),
    item('movie:42', { genreIds: [35], voteAverage: 6.1, voteCount: 120000, popularity: 800 })
  ];
  const scores = new Map<string, SummaryScore>(items.map((i) => [i.key, summaryScore(i, crimeLover, DEFAULT_DIALS, 'd')]));

  it('gems surfaces highly rated low-vote titles and excludes blockbusters', () => {
    const gems = rankDiscover(items, scores, 'gems', 'd');
    expect(gems.map((g) => g.key)).toEqual(['movie:41']);
    expect(isGem(items[1])).toBe(true);
    expect(isGem(items[0])).toBe(false); // 90k votes = not hidden
  });
  it('adventurous ranks obscure above famous', () => {
    const adv = rankDiscover(items, scores, 'adventurous', 'd');
    expect(adv[0].key).toBe('movie:41');
  });
  it('diversify breaks up single-genre runs', () => {
    const sameGenre = [0, 1, 2, 3].map((n) => item(`movie:5${n}`, { genreIds: [28], voteAverage: 8 - n * 0.1, voteCount: 5000, popularity: 50 }));
    const other = item('movie:60', { genreIds: [99], voteAverage: 7.9, voteCount: 5000, popularity: 50 });
    const all = [...sameGenre, other];
    const sc = new Map(all.map((i) => [i.key, summaryScore(i, crimeLover, DEFAULT_DIALS, 'd')]));
    const out = diversify(all, sc);
    expect(out[1].key).toBe('movie:60'); // the documentary jumps the action run
  });
  it('excludes watched, dropped, not-interested and repeatedly dismissed titles', () => {
    expect(isDiscoverable('movie:70', undefined)).toBe(true);
    expect(isDiscoverable('movie:70', makeEntry({ key: 'movie:70', status: 'watchlist' }))).toBe(true);
    expect(isDiscoverable('movie:70', makeEntry({ key: 'movie:70', status: 'watched' }))).toBe(false);
    expect(isDiscoverable('movie:70', makeEntry({ key: 'movie:70', status: 'dropped' }))).toBe(false);
    expect(isDiscoverable('movie:70', makeEntry({ key: 'movie:70', notInterested: true }))).toBe(false);
    expect(isDiscoverable('movie:70', makeEntry({ key: 'movie:70', dismissedCount: 2 }))).toBe(false);
  });
  it('feed tagline names real taste drivers or admits a fresh profile', () => {
    expect(feedTagline(crimeLover)).toContain('Tuned to your taste');
    const fresh = buildTasteModel([], new Map(), new Map(), [], [], undefined as any);
    expect(feedTagline(fresh)).toContain('Fresh profile');
  });
  it('genre id to name mapping covers both catalogs', () => {
    expect(genreNamesFor('movie', [28, 878])).toEqual(['Action', 'Science Fiction']);
    expect(genreNamesFor('tv', [10765, 9648])).toEqual(['Sci-Fi & Fantasy', 'Mystery']);
  });
});
