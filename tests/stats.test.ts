import { describe, it, expect } from 'vitest';
import { pearson, computeYearStats, computeTasteDNA, computeTasteEvolution } from '../src/analytics/stats';
import { makeMeta, makeEntry } from './helpers';
import type { DiaryEntry, TitleMeta } from '../src/data/types';

describe('pearson correlation', () => {
  it('returns null under 8 samples', () => {
    expect(pearson([1, 2, 3], [1, 2, 3])).toBeNull();
  });
  it('perfect correlation = 1', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(pearson(xs, xs.map((x) => x * 2))).toBeCloseTo(1);
  });
  it('inverse correlation is negative', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(pearson(xs, xs.map((x) => -x))!).toBeLessThan(-0.99);
  });
});

describe('year stats', () => {
  it('aggregates movies, episodes, hours, genres', () => {
    const titles = new Map<string, TitleMeta>([
      ['movie:1', makeMeta({ key: 'movie:1', title: 'A', runtime: 120, genreNames: ['Drama'], cast: [{ id: 1, name: 'Actor One', order: 0 }], crew: [{ id: 2, name: 'Director One', job: 'Director' }] })],
      ['tv:1', makeMeta({ key: 'tv:1', title: 'B', episodeRuntimes: [50], genreNames: ['Crime'] })]
    ]);
    const diary: DiaryEntry[] = [
      { id: 1, key: 'movie:1', mediaType: 'movie', date: '2026-03-05', rating: 4.5, rewatch: false, createdAt: 1 },
      { id: 2, key: 'tv:1', mediaType: 'tv', date: '2026-03-06', season: 1, episode: 1, rewatch: false, createdAt: 2 },
      { id: 3, key: 'tv:1', mediaType: 'tv', date: '2026-03-06', season: 1, episode: 2, rewatch: false, createdAt: 3 }
    ];
    const stats = computeYearStats(2026, [], diary, titles);
    expect(stats.moviesWatched).toBe(1);
    expect(stats.episodesWatched).toBe(2);
    expect(stats.hoursWatched).toBe(Math.round((120 + 100) / 60));
    expect(stats.topGenres[0].name).toBeDefined();
    expect(stats.averageRating).toBe(4.5);
    expect(stats.mostActiveMonth?.month).toBe('March');
  });
});

describe('taste evolution', () => {
  it('detects a genre shift with enough history', () => {
    const titles = new Map<string, TitleMeta>();
    titles.set('movie:old', makeMeta({ key: 'movie:old', genreNames: ['Comedy'] }));
    titles.set('movie:new', makeMeta({ key: 'movie:new', genreNames: ['Science Fiction'] }));
    const diary: DiaryEntry[] = [];
    for (let i = 0; i < 12; i++) diary.push({ key: 'movie:old', mediaType: 'movie', date: `2025-06-${String(i + 1).padStart(2, '0')}`, rewatch: false, createdAt: i });
    for (let i = 0; i < 12; i++) diary.push({ key: 'movie:new', mediaType: 'movie', date: `2026-08-${String(i + 1).padStart(2, '0')}`, rewatch: false, createdAt: 100 + i });
    const now = new Date('2026-09-01').getTime();
    const shift = computeTasteEvolution(diary, titles, now);
    expect(shift).not.toBeNull();
    expect(shift!.description.toLowerCase()).toContain('science fiction');
  });
});
