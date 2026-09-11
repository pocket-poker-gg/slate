import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { computeConsensus, getExternalRatings } from '../src/providers/ratings';
import { parseOmdb } from '../src/providers/omdb';
import { imdbShardFor, imdbShardUrl, lookupImdbRating } from '../src/providers/imdbDataset';
import { makeMeta } from './helpers';
import { db } from '../src/storage/db';

const MATRIX = 'tt0133093';

describe('IMDb dataset lookup', () => {
  it('shards deterministically by tconst number', () => {
    const s = imdbShardFor(MATRIX);
    expect(s).toBe(133093 % 128);
    expect(imdbShardUrl(s)).toBe(`/imdb-ratings/r${String(s).padStart(3, '0')}.json`);
    expect(imdbShardFor('tt0000001')).toBe(1);
  });
  it('rejects malformed ids', async () => {
    expect(imdbShardFor('nm1234')).toBe(-1);
    expect(await lookupImdbRating('not-an-id')).toBeNull();
    expect(await lookupImdbRating(undefined)).toBeNull();
  });
  it('returns rating and votes from a cached shard without network', async () => {
    const shard = imdbShardFor(MATRIX);
    const url = imdbShardUrl(shard);
    await db.metaCache.put({ url, data: { [MATRIX]: [87, 2276760] }, fetchedAt: Date.now(), expiresAt: Date.now() + 60000 });
    const hit = await lookupImdbRating(MATRIX);
    expect(hit).toEqual({ rating: 8.7, votes: 2276760 });
  });
  it('returns null for a title missing from the shard', async () => {
    const shard = imdbShardFor(MATRIX);
    const url = imdbShardUrl(shard);
    await db.metaCache.put({ url, data: { tt9999999: [55, 1200] }, fetchedAt: Date.now(), expiresAt: Date.now() + 60000 });
    expect(await lookupImdbRating(MATRIX)).toBeNull();
  });
});

describe('OMDb parsing', () => {
  it('parses ratings array and metascore', () => {
    const parsed = parseOmdb({
      Response: 'True',
      imdbRating: '8.7',
      imdbVotes: '2,276,760',
      Metascore: '73',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '8.7/10' },
        { Source: 'Rotten Tomatoes', Value: '83%' },
        { Source: 'Metacritic', Value: '73/100' }
      ]
    });
    expect(parsed).toEqual({ imdbRating: 8.7, imdbVotes: 2276760, metascore: 73, tomatometer: 83 });
  });
  it('tolerates N/A and missing fields', () => {
    expect(parseOmdb({ Response: 'True', imdbRating: 'N/A', Metascore: 'N/A', Ratings: [] })).toBeNull();
    const partial = parseOmdb({ Response: 'True', imdbRating: 'N/A', Metascore: '41', Ratings: [{ Source: 'Rotten Tomatoes', Value: '12%' }] });
    expect(partial).toEqual({ metascore: 41, tomatometer: 12 });
  });
  it('returns null on Response False (bad key / unknown title)', () => {
    expect(parseOmdb({ Response: 'False', Error: 'Invalid API key!' })).toBeNull();
  });
});

describe('external ratings assembly', () => {
  beforeEach(async () => { await db.metaCache.clear(); });

  it('uses the bundled IMDb dataset and keeps honest unavailable states', async () => {
    const shard = imdbShardFor(MATRIX);
    await db.metaCache.put({ url: imdbShardUrl(shard), data: { [MATRIX]: [87, 2276760] }, fetchedAt: Date.now(), expiresAt: Date.now() + 60000 });
    const meta = makeMeta({ key: 'movie:1', imdbId: MATRIX, voteAverage: 8.2, voteCount: 24000 });
    const ratings = await getExternalRatings(meta);
    const by = Object.fromEntries(ratings.map((r) => [r.source, r]));
    expect(by.tmdb.available).toBe(true);
    expect(by.imdb.available).toBe(true);
    expect(by.imdb.value).toBe(87);
    expect(by.imdb.kind).toBe('audience');
    // no OMDb key configured in tests -> RT/Metacritic degrade gracefully
    expect(by.rottentomatoes.available).toBe(false);
    expect(by.metacritic.available).toBe(false);
    // Google + Letterboxd are always honest unavailable-with-link
    expect(by.google.available).toBe(false);
    expect(by.google.url).toContain('google.com/search');
    expect(by.letterboxd.available).toBe(false);
  });

  it('falls back to the OMDb mirror when the dataset misses a title', async () => {
    const shard = imdbShardFor(MATRIX);
    await db.metaCache.put({ url: imdbShardUrl(shard), data: {}, fetchedAt: Date.now(), expiresAt: Date.now() + 60000 });
    const omdb = { imdbRating: 7.4, imdbVotes: 9012, metascore: 65, tomatometer: 71 };
    const { imdbProvider, rtProvider, metacriticProvider } = await import('../src/providers/ratings');
    const meta = makeMeta({ key: 'movie:2', imdbId: MATRIX, title: 'Some Film' });
    const imdb = await imdbProvider.getRating(meta, { omdb });
    expect(imdb?.available).toBe(true);
    expect(imdb?.value).toBe(74);
    const rt = await rtProvider.getRating(meta, { omdb });
    expect(rt).toMatchObject({ available: true, value: 71, rawLabel: '71%', kind: 'critic' });
    const mc = await metacriticProvider.getRating(meta, { omdb });
    expect(mc).toMatchObject({ available: true, value: 65, rawLabel: '65/100', kind: 'critic' });
  });

  it('keeps imported user values authoritative over providers', async () => {
    const meta = makeMeta({ key: 'movie:3', imdbId: MATRIX, voteAverage: 8, voteCount: 100 });
    const ratings = await getExternalRatings(meta, { imdb: { value: 91, rawLabel: '4.5/5', at: Date.now() } });
    const imdb = ratings.find((r) => r.source === 'imdb');
    expect(imdb?.value).toBe(91);
    expect(imdb?.rawLabel).toBe('4.5/5');
  });
});

describe('consensus with real multi-source data', () => {
  it('computes agreement across sources', () => {
    const close = computeConsensus([
      { source: 'tmdb', label: 'TMDB', kind: 'audience', value: 82, available: true },
      { source: 'imdb', label: 'IMDb', kind: 'audience', value: 87, available: true },
      { source: 'rottentomatoes', label: 'RT Tomatometer', kind: 'critic', value: 83, available: true },
      { source: 'metacritic', label: 'Metacritic', kind: 'critic', value: 73, available: true },
      { source: 'google', label: 'Google', kind: 'aggregate', available: false }
    ]);
    expect(close.insufficient).toBe(false);
    expect(close.sampleSize).toBe(4);
    expect(close.consensus).toBe(81);
    expect(['High', 'Mixed']).toContain(close.agreement);
  });
  it('ignores unavailable rows and stays honest about thin data', () => {
    const thin = computeConsensus([{ source: 'tmdb', label: 'TMDB', kind: 'audience', value: 80, available: true }]);
    expect(thin.insufficient).toBe(true);
    expect(computeConsensus([{ source: 'google', label: 'Google', kind: 'aggregate', available: false }]).insufficient).toBe(true);
  });
});
