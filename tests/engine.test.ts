import { describe, it, expect } from 'vitest';
import { qualityPrior, mmrRerank, scoreCandidate, titleSimilarity, isEligible, matchPct, commitmentFit, completionFit, negativePenalty } from '../src/recommendation/engine';
import { buildTasteModel } from '../src/recommendation/taste';
import { tonightPass } from '../src/recommendation/recommend';
import { predictRating, finishLikelihood, commitmentValue } from '../src/recommendation/predict';
import { makeMeta, makeEntry, PROFILES } from './helpers';
import type { ScoredCandidate } from '../src/recommendation/engine';
import type { TitleMeta } from '../src/data/types';

const emptyModel = buildTasteModel([], new Map(), new Map(), [], []);

describe('quality prior', () => {
  it('uses bayesian average - low vote counts pull toward the mean', () => {
    const high = qualityPrior(makeMeta({ key: 'm:1', voteAverage: 9.5, voteCount: 50000 }));
    const low = qualityPrior(makeMeta({ key: 'm:2', voteAverage: 9.5, voteCount: 5 }));
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0.6); // near the global mean 6.5/10
  });
});

describe('MMR diversity reranking', () => {
  it('does not return a single-genre sweep when diverse candidates exist', () => {
    const mk = (key: string, genres: string[], score: number): ScoredCandidate => ({
      meta: makeMeta({ key, genreNames: genres, keywords: genres.map((g) => g.toLowerCase()) }),
      score, matchPct: matchPct(score),
      components: {} as any
    });
    const pool = [
      mk('tv:1', ['Crime', 'Drama'], 0.9), mk('tv:2', ['Crime', 'Drama'], 0.88), mk('tv:3', ['Crime'], 0.86),
      mk('tv:4', ['Comedy'], 0.8), mk('tv:5', ['Science Fiction'], 0.78), mk('tv:6', ['Documentary'], 0.76)
    ];
    const out = mmrRerank(pool, 4, 0.7);
    const allCrime = out.every((c) => c.meta.genreNames.includes('Crime'));
    expect(allCrime).toBe(false);
  });
});

describe('tonight filters', () => {
  const movie90 = makeMeta({ key: 'movie:1', runtime: 95, genreNames: ['Thriller'] });
  const longShow = makeMeta({ key: 'tv:1', numberOfSeasons: 6, numberOfEpisodes: 62, episodeRuntimes: [50], genreNames: ['Drama'] });
  const mini = makeMeta({ key: 'tv:2', numberOfSeasons: 1, numberOfEpisodes: 6, episodeRuntimes: [55], genreNames: ['Mystery'] });
  it('time filter respects runtimes', () => {
    expect(tonightPass(movie90, { time: 'h2' })).toBe(true);
    expect(tonightPass(movie90, { time: 'lt30' })).toBe(false);
    expect(tonightPass(longShow, { time: 'h1' })).toBe(true); // per-episode
  });
  it('commitment filter separates miniseries from long runners', () => {
    expect(tonightPass(mini, { commitment: 'miniseries' })).toBe(true);
    expect(tonightPass(longShow, { commitment: 'miniseries' })).toBe(false);
    expect(tonightPass(longShow, { commitment: 'short_series' })).toBe(false);
  });
  it('mood filter uses genre mapping', () => {
    expect(tonightPass(movie90, { mood: 'thrilling' })).toBe(true);
    expect(tonightPass(movie90, { mood: 'funny' })).toBe(false);
  });
});

describe('eligibility', () => {
  it('excludes watched, dropped, not-interested, doubly dismissed', () => {
    const m = makeMeta({ key: 'm:1' });
    expect(isEligible(m, undefined)).toBe(true);
    expect(isEligible(m, makeEntry({ key: 'm:1', status: 'watched' }))).toBe(false);
    expect(isEligible(m, makeEntry({ key: 'm:1', status: 'dropped' }))).toBe(false);
    expect(isEligible(m, makeEntry({ key: 'm:1', notInterested: true }))).toBe(false);
    expect(isEligible(m, makeEntry({ key: 'm:1', dismissedCount: 2 }))).toBe(false);
    expect(isEligible(m, makeEntry({ key: 'm:1', status: 'watchlist' }))).toBe(true);
  });
});

describe('predictions', () => {
  it('predicted rating stays in 0.5..5', () => {
    const p = predictRating(makeMeta({ key: 'm:5', voteAverage: 8.4, voteCount: 9000 }), emptyModel);
    expect(p.rating).toBeGreaterThanOrEqual(0.5);
    expect(p.rating).toBeLessThanOrEqual(5);
  });
  it('commitment value favors short excellence', () => {
    const short = commitmentValue(makeMeta({ key: 'm:6', runtime: 100, voteAverage: 8.5, voteCount: 20000 }), emptyModel);
    const long = commitmentValue(makeMeta({ key: 'tv:6', numberOfEpisodes: 80, episodeRuntimes: [55], voteAverage: 8.5, voteCount: 20000 }), emptyModel);
    expect(short.value).toBeGreaterThan(long.value);
  });
  it('finish likelihood reflects completion history', () => {
    const titles = new Map<string, TitleMeta>();
    titles.set('tv:1', makeMeta({ key: 'tv:1', numberOfSeasons: 2, numberOfEpisodes: 16, genreNames: ['Mystery'] }));
    for (let i = 2; i <= 6; i++) titles.set(`tv:${i}`, makeMeta({ key: `tv:${i}`, numberOfSeasons: 2, numberOfEpisodes: 16, genreNames: ['Mystery'] }));
    const library = [makeEntry({ key: 'tv:1', status: 'watched', rating: 5 }),
      ...[2, 3, 4, 5, 6].map((i) => makeEntry({ key: `tv:${i}`, status: 'watched', rating: 4 }))];
    const progress = new Map([['tv:1', { key: 'tv:1', episodes: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`1:${i + 1}`, { watchedAt: 1 }])), updatedAt: 1 }]]);
    const model = buildTasteModel(library, titles, progress as any, [], []);
    const shortShow = makeMeta({ key: 'tv:7', numberOfSeasons: 1, numberOfEpisodes: 8, genreNames: ['Mystery'], status: 'Ended' });
    const longShow = makeMeta({ key: 'tv:8', numberOfSeasons: 9, numberOfEpisodes: 200, genreNames: ['Mystery'], status: 'Returning Series' });
    const s = finishLikelihood(shortShow, model); const l = finishLikelihood(longShow, model);
    expect(s).not.toBeNull(); expect(l).not.toBeNull();
    expect(s!.pct).toBeGreaterThan(l!.pct);
  });
});

describe('penalties and fit', () => {
  it('negative penalty rises for disliked genres', () => {
    const titles = new Map<string, TitleMeta>([['m:1', makeMeta({ key: 'm:1', genreNames: ['Horror'] })]]);
    const model = buildTasteModel([makeEntry({ key: 'm:1', rating: 1 })], titles, new Map(), [], []);
    expect(negativePenalty(makeMeta({ key: 'm:2', genreNames: ['Horror'] }), model)).toBeGreaterThan(0);
  });
  it('completion fit prefers series near completed lengths', () => {
    const titles = new Map<string, TitleMeta>([['tv:1', makeMeta({ key: 'tv:1', numberOfSeasons: 2, numberOfEpisodes: 16 })]]);
    const library = [makeEntry({ key: 'tv:1', status: 'watched', rating: 4.5 })];
    const progress = new Map([['tv:1', { key: 'tv:1', episodes: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`1:${i + 1}`, { watchedAt: 1 }])), updatedAt: 1 }]]);
    const model = buildTasteModel(library, titles, progress as any, [], []);
    const near = completionFit(makeMeta({ key: 'tv:2', numberOfSeasons: 2 }), model);
    const far = completionFit(makeMeta({ key: 'tv:3', numberOfSeasons: 10 }), model);
    expect(near).toBeGreaterThan(far);
  });
});
