import type { ExternalRating, TitleMeta } from '../data/types';

export interface RatingProvider {
  id: string;
  name: string;
  kind: 'critic' | 'audience' | 'aggregate';
  getRating(title: TitleMeta): Promise<ExternalRating | null>;
}

// TMDB rating is available automatically via the public API (already fetched with title details).
export const tmdbRatingProvider: RatingProvider = {
  id: 'tmdb',
  name: 'TMDB',
  kind: 'aggregate',
  async getRating(title) {
    if (title.voteAverage && title.voteCount && title.voteCount > 0) {
      return {
        source: 'tmdb', label: 'TMDB', kind: 'aggregate',
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

// IMDb, Rotten Tomatoes and Letterboxd do not offer free lawful automatic rating APIs
// for client-side apps. We never scrape them. We surface an honest "unavailable"
// state plus an external link, and any user-imported values appear separately.
export const imdbProvider: RatingProvider = {
  id: 'imdb', name: 'IMDb', kind: 'aggregate',
  async getRating(title) {
    const url = title.imdbId ? `https://www.imdb.com/title/${title.imdbId}/` : undefined;
    return unavailable('imdb', 'IMDb', 'aggregate', url, 'Unavailable automatically');
  }
};
export const rtProvider: RatingProvider = {
  id: 'rottentomatoes', name: 'Rotten Tomatoes', kind: 'critic',
  async getRating(title) {
    const q = encodeURIComponent(title.title);
    return unavailable('rottentomatoes', 'Rotten Tomatoes', 'critic', `https://www.rottentomatoes.com/search?search=${q}`, 'Unavailable automatically');
  }
};
export const letterboxdProvider: RatingProvider = {
  id: 'letterboxd', name: 'Letterboxd', kind: 'audience',
  async getRating(title) {
    const q = encodeURIComponent(title.title);
    return unavailable('letterboxd', 'Letterboxd', 'audience', `https://letterboxd.com/search/${q}/`, 'Unavailable automatically');
  }
};

export const ratingProviders: RatingProvider[] = [tmdbRatingProvider, imdbProvider, rtProvider, letterboxdProvider];

export async function getExternalRatings(title: TitleMeta, imported?: Partial<Record<string, { value: number; rawLabel: string; at: number }>>): Promise<ExternalRating[]> {
  const out: ExternalRating[] = [];
  for (const p of ratingProviders) {
    const imp = imported?.[p.id];
    if (imp) {
      out.push({ source: p.id, label: p.name, kind: p.kind, value: imp.value, rawLabel: imp.rawLabel, available: true, url: undefined });
      continue;
    }
    try {
      const r = await p.getRating(title);
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
