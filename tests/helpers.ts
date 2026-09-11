import type { TitleMeta, LibraryEntry, MediaType } from '../src/data/types';

export function makeMeta(over: Partial<TitleMeta> & { key: string }): TitleMeta {
  return {
    tmdbId: Number(over.key.split(':')[1]), mediaType: over.key.split(':')[0] as MediaType,
    title: over.key, genreNames: [], keywords: [], cast: [], crew: [], networks: [], companies: [],
    originCountry: [], episodeRuntimes: [], seasons: [], recommendations: [], similar: [],
    genres: [], fetchedAt: Date.now(), detailLevel: 'full', ...over
  };
}

export function makeEntry(over: Partial<LibraryEntry> & { key: string }): LibraryEntry {
  return {
    favorite: false, reviewSpoiler: false, tags: [], priority: 0, watchSoon: false,
    addedAt: Date.now(), updatedAt: Date.now(), watchCount: 0, notInterested: false,
    skipCount: 0, dismissedCount: 0, ...over
  };
}

// Synthetic profiles per spec §77
export const PROFILES = {
  cerebralDark: ['Mr. Robot', 'Dark', 'Severance', 'Black Mirror'],
  prestigeCrime: ['The Sopranos', 'The Wire', 'Breaking Bad', 'Better Call Saul'],
  comfortComedy: ['The Office', 'Parks and Recreation', 'Brooklyn Nine-Nine'],
  anime: ['Cowboy Bebop', 'Attack on Titan', 'Death Note']
};
