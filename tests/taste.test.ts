import { describe, it, expect } from 'vitest';
import { buildTasteModel, tasteSimilarity, entrySignal } from '../src/recommendation/taste';
import { makeMeta, makeEntry, PROFILES } from './helpers';
import type { TitleMeta } from '../src/data/types';

function profileLibrary(names: string[], genreMap: Record<string, string[]>) {
  const titles = new Map<string, TitleMeta>();
  const library = names.map((name, i) => {
    const key = `tv:${1000 + i}`;
    titles.set(key, makeMeta({ key, title: name, genreNames: genreMap[name] ?? ['Drama'], keywords: genreMap[name]?.map((g) => g.toLowerCase()) ?? [] }));
    return makeEntry({ key, status: 'watched', rating: 4.5, favorite: true, watchCount: 1 });
  });
  return { titles, library };
}

describe('taste model', () => {
  it('builds genre affinity from highly rated titles', () => {
    const genreMap: Record<string, string[]> = Object.fromEntries(PROFILES.prestigeCrime.map((n) => [n, ['Crime', 'Drama']]));
    const { titles, library } = profileLibrary(PROFILES.prestigeCrime, genreMap);
    const model = buildTasteModel(library, titles, new Map(), [], []);
    expect(model.genres['Crime']).toBeGreaterThan(0.5);
    expect(model.genres['Comedy'] ?? 0).toBe(0);
  });

  it('penalizes disliked titles', () => {
    const titles = new Map<string, TitleMeta>();
    titles.set('movie:1', makeMeta({ key: 'movie:1', genreNames: ['Horror'] }));
    const library = [makeEntry({ key: 'movie:1', rating: 1 })];
    const model = buildTasteModel(library, titles, new Map(), [], []);
    expect(model.genres['Horror']).toBeLessThan(0);
  });

  it('profiles get materially different similarity rankings', () => {
    const crimeMap: Record<string, string[]> = Object.fromEntries(PROFILES.prestigeCrime.map((n) => [n, ['Crime', 'Drama']]));
    const comedyMap: Record<string, string[]> = Object.fromEntries(PROFILES.comfortComedy.map((n) => [n, ['Comedy']]));
    const cp = profileLibrary(PROFILES.prestigeCrime, crimeMap);
    const kp = profileLibrary(PROFILES.comfortComedy, comedyMap);
    const crime = buildTasteModel(cp.library, cp.titles, new Map(), [], []);
    const comedy = buildTasteModel(kp.library, kp.titles, new Map(), [], []);
    const crimeCand = makeMeta({ key: 'tv:9', genreNames: ['Crime', 'Drama'], keywords: ['crime'] });
    const comedyCand = makeMeta({ key: 'tv:10', genreNames: ['Comedy'], keywords: ['comedy'] });
    expect(tasteSimilarity(crimeCand, crime)).toBeGreaterThan(tasteSimilarity(comedyCand, crime));
    expect(tasteSimilarity(comedyCand, comedy)).toBeGreaterThan(tasteSimilarity(crimeCand, comedy));
  });

  it('entrySignal reflects strong/weak/negative signals', () => {
    expect(entrySignal(makeEntry({ key: 'a', rating: 5, favorite: true }))).toBeGreaterThan(0.9);
    expect(entrySignal(makeEntry({ key: 'b', status: 'watchlist' }))).toBeLessThan(0.4);
    expect(entrySignal(makeEntry({ key: 'c', status: 'dropped' }))).toBeLessThan(0);
    expect(entrySignal(makeEntry({ key: 'd', notInterested: true }))).toBeLessThanOrEqual(-1);
  });
});
