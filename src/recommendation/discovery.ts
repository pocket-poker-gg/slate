// Discovery engine: real TMDB discover feeds driven by the on-device taste
// model. Every layer is real: dials change the actual API request AND the
// ranking, every card is scored (not just previously-opened titles), results
// paginate through the full catalog, and anything already in the library or
// dismissed is excluded. Nothing canned, nothing reshuffled-static.
import type { DiscoveryDials, LibraryEntry, Settings } from '../data/types';
import type { DiscoverParams, SearchResultItem } from '../providers/tmdb';
import { qualityPrior, novelty, exploration, matchPct } from './engine';
import type { TasteModel } from './taste';

export const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western'
};
export const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western'
};
export const genreNamesFor = (mediaType: 'movie' | 'tv', ids: number[]): string[] =>
  ids.map((id) => (mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES)[id]).filter((n): n is string => !!n);

export interface DiscoverFilters {
  mediaType: 'movie' | 'tv';
  genres?: number[];
  minRating?: number;
  maxRuntime?: number;
  decade?: number;
  status?: string;
  language?: string;
  miniseries?: boolean;
  providers?: number[];
}

// --- Dial-driven query mapping: the dials change what TMDB returns, not just the order ---
export function discoverQueryFor(f: DiscoverFilters, dials: DiscoveryDials, page: number, sortMode?: DiscoverSort): DiscoverParams {
  const params: DiscoverParams = {
    mediaType: f.mediaType,
    page,
    genres: f.genres?.length ? f.genres : undefined,
    voteGte: f.minRating,
    runtimeLte: f.mediaType === 'movie' ? f.maxRuntime : undefined,
    yearGte: f.decade,
    yearLte: f.decade ? f.decade + 9 : undefined,
    language: f.language,
    tvType: f.mediaType === 'tv' && f.miniseries ? 2 : undefined,
    providers: f.providers?.length ? f.providers : undefined,
    status: f.mediaType === 'tv' ? f.status : undefined
  };
  // Popular / Hidden gem: changes the source ordering and the vote floor.
  // Hidden end asks TMDB for best-rated titles with a low vote floor - the lane
  // where genuine deep cuts live instead of the all-time popular list.
  // Sort modes with a real catalog-side lane become request changes, not just
  // re-ranking: gems ask TMDB for high-rated, low-vote titles directly so the
  // lane paginates deeply instead of filtering a popular page down to scraps.
  if (sortMode === 'gems') {
    params.sort = 'vote_average.desc';
    params.voteCountGte = GEM_MIN_VOTES;
    params.voteCountLte = GEM_MAX_VOTES;
    params.voteGte = params.voteGte ?? GEM_MIN_RATING;
    return params;
  }
  if (sortMode === 'quality') {
    params.sort = 'vote_average.desc';
    params.voteCountGte = Math.max(params.voteCountGte ?? 0, 1000);
    return params;
  }
  if (dials.popularHidden < 0.34) {
    params.sort = 'popularity.desc';
    params.voteCountGte = Math.max(params.voteCountGte ?? 0, 500);
  } else if (dials.popularHidden > 0.67) {
    params.sort = 'vote_average.desc';
    params.voteCountGte = 40;
  } else {
    params.sort = 'popularity.desc';
  }
  // Immediate / Slow burn (movies): the impatient end caps the runtime in the request.
  if (f.mediaType === 'movie' && dials.immediateSlowburn < 0.34 && !params.runtimeLte) params.runtimeLte = 110;
  return params;
}

// --- Summary-level scoring: every card gets a real score, no hydration needed ---
const LIGHT = new Set(['Comedy', 'Family', 'Animation', 'Romance', 'Music', 'Kids']);
const DARK = new Set(['Crime', 'Thriller', 'Horror', 'Mystery', 'War', 'War & Politics']);
const CEREBRAL = new Set(['Mystery', 'Science Fiction', 'Sci-Fi & Fantasy', 'Documentary', 'Drama']);
const EASY = new Set(['Comedy', 'Family', 'Animation', 'Adventure', 'Action & Adventure', 'Reality']);

export interface SummaryScore { total: number; pct: number; quality: number; nov: number; genreAffinity: number }

export function summaryScore(item: SearchResultItem, model: TasteModel, dials: DiscoveryDials, salt: string): SummaryScore {
  const names = genreNamesFor(item.mediaType, item.genreIds);
  let gs = 0;
  for (const n of names) gs += model.genres[n] ?? 0;
  const genreAffinity = names.length ? (Math.tanh(gs) + 1) / 2 : 0.5;
  const quality = qualityPrior({ voteAverage: item.voteAverage, voteCount: item.voteCount } as any);
  const nov = novelty({ popularity: item.popularity } as any);
  const darkShare = names.length ? names.filter((n) => DARK.has(n)).length / names.length : 0;
  const lightShare = names.length ? names.filter((n) => LIGHT.has(n)).length / names.length : 0;
  const cerebralShare = names.length ? names.filter((n) => CEREBRAL.has(n)).length / names.length : 0;
  const easyShare = names.length ? names.filter((n) => EASY.has(n)).length / names.length : 0;

  let total =
    0.34 * genreAffinity +
    0.26 * quality +
    0.10 * nov +
    0.08 * exploration(item.key, salt) +
    0.05 * (item.voteAverage ?? 0) / 10;
  total += (dials.lightDark - 0.5) * 0.18 * (darkShare - lightShare);
  total += (dials.easyCerebral - 0.5) * 0.14 * (cerebralShare - easyShare);
  total += (dials.popularHidden - 0.5) * 0.18 * (nov - 0.5) * 2;
  total += (dials.familiarAdventurous - 0.5) * 0.12 * (0.5 - genreAffinity) * 2;
  let pen = 0;
  for (const n of names) { const w = model.genres[n] ?? 0; if (w < 0) pen += -w * 0.5; }
  total -= Math.min(0.5, pen);
  total = Math.max(0, Math.min(1, total));
  return { total, pct: matchPct(total), quality, nov, genreAffinity };
}

// --- Sort modes ---
export type DiscoverSort = 'match' | 'quality' | 'gems' | 'adventurous';

export const GEM_MIN_VOTES = 40;
export const GEM_MAX_VOTES = 20000;
export const GEM_MIN_RATING = 6.8;
export const isGem = (i: SearchResultItem): boolean =>
  (i.voteCount ?? 0) >= GEM_MIN_VOTES && (i.voteCount ?? 0) <= GEM_MAX_VOTES && (i.voteAverage ?? 0) >= GEM_MIN_RATING;
export const gemScore = (i: SearchResultItem, s?: SummaryScore): number =>
  (s?.quality ?? qualityPrior({ voteAverage: i.voteAverage, voteCount: i.voteCount } as any)) *
  (0.5 + 0.5 * (s?.nov ?? novelty({ popularity: i.popularity } as any)));

export function rankDiscover(items: SearchResultItem[], scores: Map<string, SummaryScore>, sort: DiscoverSort, salt: string): SearchResultItem[] {
  const arr = [...items];
  const sc = (k: string) => scores.get(k);
  switch (sort) {
    case 'match':
      return arr.sort((a, b) => (sc(b.key)?.total ?? 0.4) - (sc(a.key)?.total ?? 0.4));
    case 'quality':
      return arr.sort((a, b) => (sc(b.key)?.quality ?? 0) - (sc(a.key)?.quality ?? 0));
    case 'gems':
      return arr.filter(isGem).sort((a, b) => gemScore(b, sc(b.key)) - gemScore(a, sc(a.key)));
    case 'adventurous':
      return arr.sort((a, b) =>
        ((sc(b.key)?.nov ?? 0.5) * 0.65 + exploration(b.key, salt) * 0.35) -
        ((sc(a.key)?.nov ?? 0.5) * 0.65 + exploration(a.key, salt) * 0.35));
  }
}

// --- Light genre-diversity pass so one genre cannot flood the top of the feed ---
export function diversify(items: SearchResultItem[], scores: Map<string, SummaryScore>, penalty = 0.12): SearchResultItem[] {
  const picked: SearchResultItem[] = [];
  const pool = [...items];
  while (pool.length) {
    let bestIdx = 0; let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      let maxSim = 0;
      for (const sel of picked) {
        const a = new Set(cand.genreIds);
        const inter = sel.genreIds.filter((g) => a.has(g)).length;
        const union = new Set([...cand.genreIds, ...sel.genreIds]).size || 1;
        maxSim = Math.max(maxSim, inter / union);
      }
      const val = (scores.get(cand.key)?.total ?? 0.4) - penalty * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    picked.push(pool.splice(bestIdx, 1)[0]);
  }
  return picked;
}

// --- Exclusions: library + feedback hygiene (same semantics as the rec engine) ---
export function isDiscoverable(key: string, entry: LibraryEntry | undefined): boolean {
  if (!entry) return true;
  if (entry.notInterested) return false;
  if (entry.status === 'watched' || entry.status === 'dropped') return false;
  if (entry.dismissedCount >= 2) return false;
  return true;
}

// --- Visible personalization: explain what the feed is tuned to ---
export function feedTagline(model: TasteModel): string {
  if (model.signalCount < 3) return 'Fresh profile - ranked by quality and novelty. Rate a few titles and this feed retunes itself.';
  const top = Object.entries(model.genres).filter(([, w]) => w > 0.3).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g]) => g);
  if (!top.length) return 'Tuned to your ratings, watch history and feedback.';
  return `Tuned to your taste: ${top.join(' + ')}.`;
}

export const todaySalt = () => new Date().toISOString().slice(0, 10);
export { matchPct };
