import { describe, it, expect } from 'vitest';
import { validateCategories, categoryQuery, findHub, hubsFor, MOVIE_HUBS, TV_HUBS } from '../src/data/categories';

describe('category data model integrity', () => {
  it('passes all structural validation (unique ids, valid keyword/genre ids)', () => {
    expect(validateCategories()).toEqual([]);
  });

  it('covers the named subgenre expectations (horror -> psychological, supernatural, ...)', () => {
    const horror = findHub('movie', 'horror')!;
    const names = horror.subgenres.map((s) => s.name.toLowerCase());
    expect(names).toContain('psychological');
    expect(names).toContain('supernatural');
    const scifi = findHub('movie', 'sci-fi')!;
    expect(scifi.subgenres.map((s) => s.name.toLowerCase())).toEqual(expect.arrayContaining(['space', 'time travel', 'dystopia']));
  });

  it('every hub exists for lookup and hubsFor returns disjoint genre anchors per media type', () => {
    expect(MOVIE_HUBS.length).toBeGreaterThanOrEqual(14);
    expect(TV_HUBS.length).toBeGreaterThanOrEqual(10);
    for (const mt of ['movie', 'tv'] as const) {
      for (const h of hubsFor(mt)) expect(findHub(mt, h.id)).toBe(h);
    }
  });
});

describe('categoryQuery', () => {
  it('ANDs the hub genre with subgenre genres and keywords', () => {
    const horror = findHub('movie', 'horror')!;
    const psych = horror.subgenres.find((s) => s.id === 'psychological')!;
    const q = categoryQuery('movie', horror, psych, 2);
    expect(q.mediaType).toBe('movie');
    expect(q.genres).toContain(27);
    expect(q.keywords).toEqual([295907]);
    expect(q.page).toBe(2);
    expect(q.sort).toBe('popularity.desc');
  });

  it('genre-combo subgenres AND the extra genre (romantic comedy = comedy + romance)', () => {
    const comedy = findHub('movie', 'comedy')!;
    const romcom = comedy.subgenres.find((s) => s.id === 'romcom')!;
    const q = categoryQuery('movie', comedy, romcom, 1);
    expect(q.genres).toEqual([35, 10749]);
  });

  it('respects mediaType end to end and drops keyword filters at hub level', () => {
    const drama = findHub('tv', 'drama')!;
    const all = categoryQuery('tv', drama, undefined, 1);
    expect(all.mediaType).toBe('tv');
    expect(all.keywords).toBeUndefined();
    const medical = categoryQuery('tv', drama, drama.subgenres.find((s) => s.id === 'medical')!, 3);
    expect(medical.keywords).toEqual([208788]);
    expect(medical.page).toBe(3);
  });
});
