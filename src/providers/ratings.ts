import type { ExternalRating, TitleMeta } from '../data/types';
import { lookupImdbRating } from './imdbDataset';
import { getOmdbRatings, type OmdbRatings } from './omdb';

export interface RatingProvider {
  id: string;
  name: string;
  kind: 'critic' | 'audience' | 'aggregate';
  getRating(title: TitleMeta, ctx?: RatingsContext): Promise<ExternalRating | null>;
}

// Shared per-title context so each external source is fetched at most once
// per render even when several providers read from it.
export interface RatingsContext { omdb?: OmdbRatings | null }

// TMDB rating is available automatically via the public API (already fetched with title details).
export const tmdbRatingProvider: RatingProvider = {
  id: 'tmdb',
  name: 'TMDB',
  kind: 'audience',
  async getRating(title) {
    if (title.voteAverage && title.voteCount && title.voteCount > 0) {
      return {
        source: 'tmdb', label: 'TMDB', kind: 'audience',
        value: Math.round(title.voteAverage * 10),
        rawLabel: `${title.voteAverage.toFixed(1)}/10`,
        voteCount: title.voteCount,
        url: `https://www.themoviedb.org/${title.mediaType}/${title.tmdbId}`,
        available: true
      };
    }
    return null;
  }
};

const unavailable = (source: string, label: string, kind: 'critic' | 'audience' | 'aggregate', url: string | undefined, reason: string): ExternalRating =>
  ({ source, label, kind, url, available: false, unavailableReason: reason });

// IMDb: official non-commercial dataset (build-time sharded bundle), with the
// OMDb API as a live fallback mirror of the same score. Never scraped.
export const imdbProvider: RatingProvider = {
  id: 'imdb', name: 'IMDb', kind: 'audience',
  async getRating(title, ctx) {
    const url = title.imdbId ? `https://www.imdb.com/title/${title.imdbId}/` : undefined;
    const hit = await lookupImdbRating(title.imdbId);
    if (hit) {
      return {
        source: 'imdb', label: 'IMDb', kind: 'audience',
        value: Math.round(hit.rating * 10),
        rawLabel: `${hit.rating.toFixed(1)}/10`,
        voteCount: hit.votes, url, available: true
      };
    }
    const omdb = ctx?.omdb;
    if (omdb?.imdbRating) {
      return {
        source: 'imdb', label: 'IMDb', kind: 'audience',
        value: Math.round(omdb.imdbRating * 10),
        rawLabel: `${omdb.imdbRating.toFixed(1)}/10`,
        voteCount: omdb.imdbVotes, url, available: true
      };
    }
    return unavailable('imdb', 'IMDb', 'audience', url, 'Below the bundled-dataset vote threshold');
  }
};

// Rotten Tomatoes: the Tomatometer via OMDb. Honest labeling: it is the
// percentage of professional critics who rated the title positively, not an
// average rating.
export const rtProvider: RatingProvider = {
  id: 'rottentomatoes', name: 'RT Tomatometer', kind: 'critic',
  async getRating(title, ctx) {
    const q = encodeURIComponent(title.title);
    const url = `https://www.rottentomatoes.com/search?search=${q}`;
    const t = ctx?.omdb?.tomatometer;
    if (t !== undefined) {
      return { source: 'rottentomatoes', label: 'RT Tomatometer', kind: 'critic', value: t, rawLabel: `${t}%`, url, available: true };
    }
    return unavailable('rottentomatoes', 'RT', 'critic', url, 'Unavailable automatically');
  }
};

// Metacritic: the Metascore via OMDb (weighted critic aggregate, 0..100).
export const metacriticProvider: RatingProvider = {
  id: 'metacritic', name: 'Metacritic', kind: 'critic',
  async getRating(title, ctx) {
    const q = encodeURIComponent(title.title);
    const url = `https://www.metacritic.com/search/${q}/`;
    const m = ctx?.omdb?.metascore;
    if (m !== undefined) {
      return { source: 'metacritic', label: 'Metacritic', kind: 'critic', value: m, rawLabel: `${m}/100`, url, available: true };
    }
    return unavailable('metacritic', 'Metacritic', 'critic', url, 'Unavailable automatically');
  }
};

// Google shows ratings in its own results but offers no lawful free source for
// them; we never scrape. Honest unavailable state plus an outbound link.
export const googleProvider: RatingProvider = {
  id: 'google', name: 'Google', kind: 'aggregate',
  async getRating(title) {
    const q = encodeURIComponent(`${title.title} ${title.year ?? ''}`.trim());
    return unavailable('google', 'Google', 'aggregate', `https://www.google.com/search?q=${q}`, 'No lawful automatic source');
  }
};

// Letterboxd has no free lawful automatic API; user-imported values appear separately.
export const letterboxdProvider: RatingProvider = {
  id: 'letterboxd', name: 'Letterboxd', kind: 'audience',
  async getRating(title) {
    const q = encodeURIComponent(title.title);
    return unavailable('letterboxd', 'Letterboxd', 'audience', `https://letterboxd.com/search/${q}/`, 'Unavailable automatically');
  }
};

export const ratingProviders: RatingProvider[] = [tmdbRatingProvider, imdbProvider, rtProvider, metacriticProvider, googleProvider, letterboxdProvider];

export async function getExternalRatings(title: TitleMeta, imported?: Partial<Record<string, { value: number; rawLabel: string; at: number }>>): Promise<ExternalRating[]> {
  const ctx: RatingsContext = { omdb: await getOmdbRatings(title.imdbId) };
  const out: ExternalRating[] = [];
  for (const p of ratingProviders) {
    const imp = imported?.[p.id];
    if (imp) {
      out.push({ source: p.id, label: p.name, kind: p.kind, value: imp.value, rawLabel: imp.rawLabel, available: true, url: undefined });
      continue;
    }
    try {
      const r = await p.getRating(title, ctx);
      if (r) out.push(r);
    } catch { /* provider failure must not break the app */ }
  }
  return out;
}

// --- Consensus / agreement / polarization ---
export interface ConsensusResult {
  consensus?: number; // 0..100 how highly regarded
  agreement?: 'High' | 'Mixed' | 'Low';
  polarization?: 'Low' | 'Medium' | 'High';
  sampleSize: number;
  insufficient: boolean;
}

export function computeConsensus(ratings: ExternalRating[]): ConsensusResult {
  const vals = ratings.filter((r) => r.available && r.value !== undefined).map((r) => r.value as number);
  if (vals.length < 1) return { sampleSize: 0, insufficient: true };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (vals.length < 2) return { consensus: Math.round(mean), sampleSize: vals.length, insufficient: true };
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  return {
    consensus: Math.round(mean),
    agreement: sd < 6 ? 'High' : sd < 14 ? 'Mixed' : 'Low',
    polarization: sd < 8 ? 'Low' : sd < 18 ? 'Medium' : 'High',
    sampleSize: vals.length,
    insufficient: false
  };
}
