import type { DiaryEntry, LibraryEntry, ProgressEntry, TitleMeta } from '../data/types';

export interface YearStats {
  year: number;
  moviesWatched: number;
  episodesWatched: number;
  hoursWatched: number;
  averageRating?: number;
  rewatches: number;
  topGenres: { name: string; count: number }[];
  topCreators: { name: string; count: number }[];
  topActors: { name: string; count: number }[];
  topDecades: { name: string; count: number }[];
  topNetworks: { name: string; count: number }[];
  topLanguages: { name: string; count: number }[];
  favoriteMovie?: { key: string; title: string; rating: number };
  favoriteShow?: { key: string; title: string; rating: number };
  biggestBinge?: { key: string; title: string; episodes: number; spanDays: number };
  mostActiveMonth?: { month: string; count: number };
  ratingsDistribution: { stars: number; count: number }[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function computeYearStats(
  year: number,
  library: LibraryEntry[],
  diary: DiaryEntry[],
  titles: Map<string, TitleMeta>
): YearStats {
  const yearStr = String(year);
  const entries = diary.filter((d) => d.date.startsWith(yearStr));
  const movies = entries.filter((d) => d.mediaType === 'movie');
  const episodes = entries.filter((d) => d.mediaType === 'tv');
  let minutes = 0;
  const genreCount: Record<string, number> = {};
  const creatorCount: Record<string, number> = {};
  const actorCount: Record<string, number> = {};
  const decadeCount: Record<string, number> = {};
  const networkCount: Record<string, number> = {};
  const langCount: Record<string, number> = {};
  const ratings = entries.filter((d) => d.rating !== undefined).map((d) => d.rating as number);
  const dist = new Map<number, number>();

  for (const d of entries) {
    const meta = titles.get(d.key);
    if (!meta) continue;
    if (d.mediaType === 'movie') minutes += meta.runtime ?? 110;
    else minutes += meta.episodeRuntimes[0] ?? 45;
    for (const g of meta.genreNames) genreCount[g] = (genreCount[g] ?? 0) + 1;
    for (const c of meta.crew) if (['Director', 'Creator'].includes(c.job)) creatorCount[c.name] = (creatorCount[c.name] ?? 0) + 1;
    for (const c of meta.cast.slice(0, 5)) actorCount[c.name] = (actorCount[c.name] ?? 0) + 1;
    if (meta.year) { const dec = `${Math.floor(meta.year / 10) * 10}s`; decadeCount[dec] = (decadeCount[dec] ?? 0) + 1; }
    for (const n of meta.networks) networkCount[n] = (networkCount[n] ?? 0) + 1;
    if (meta.originalLanguage) langCount[meta.originalLanguage.toUpperCase()] = (langCount[meta.originalLanguage.toUpperCase()] ?? 0) + 1;
    if (d.rating !== undefined) dist.set(d.rating, (dist.get(d.rating) ?? 0) + 1);
  }

  const sort = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

  // favorites: highest rated this year
  let favoriteMovie: YearStats['favoriteMovie']; let favoriteShow: YearStats['favoriteShow'];
  for (const d of entries) {
    if (d.rating === undefined) continue;
    const meta = titles.get(d.key);
    if (!meta) continue;
    if (d.mediaType === 'movie' && (!favoriteMovie || d.rating > favoriteMovie.rating)) favoriteMovie = { key: d.key, title: meta.title, rating: d.rating };
    if (d.mediaType === 'tv' && (!favoriteShow || d.rating > favoriteShow.rating)) favoriteShow = { key: d.key, title: meta.title, rating: d.rating };
  }

  // biggest binge: max episodes of one series within 7 days
  const byShow = new Map<string, { date: string }[]>();
  for (const d of entries.filter((x) => x.mediaType === 'tv')) {
    const arr = byShow.get(d.key) ?? []; arr.push(d); byShow.set(d.key, arr);
  }
  let biggestBinge: YearStats['biggestBinge'];
  for (const [key, arr] of byShow) {
    const days = new Set(arr.map((x) => x.date));
    const sorted = [...days].sort();
    if (!sorted.length) continue;
    const span = (new Date(sorted[sorted.length - 1]).getTime() - new Date(sorted[0]).getTime()) / 86400000;
    if (arr.length >= 3 && (!biggestBinge || arr.length > biggestBinge.episodes)) {
      biggestBinge = { key, title: titles.get(key)?.title ?? key, episodes: arr.length, spanDays: Math.round(span) };
    }
  }

  const monthCount = new Map<number, number>();
  for (const d of entries) { const m = Number(d.date.slice(5, 7)) - 1; monthCount.set(m, (monthCount.get(m) ?? 0) + 1); }
  const topMonth = [...monthCount.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    year,
    moviesWatched: movies.length,
    episodesWatched: episodes.length,
    hoursWatched: Math.round(minutes / 60),
    averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : undefined,
    rewatches: entries.filter((d) => d.rewatch).length,
    topGenres: sort(genreCount),
    topCreators: sort(creatorCount),
    topActors: sort(actorCount),
    topDecades: sort(decadeCount),
    topNetworks: sort(networkCount),
    topLanguages: sort(langCount),
    favoriteMovie, favoriteShow, biggestBinge,
    mostActiveMonth: topMonth ? { month: MONTHS[topMonth[0]], count: topMonth[1] } : undefined,
    ratingsDistribution: [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([stars, count]) => ({ stars, count }))
  };
}

// --- Taste DNA ---
export interface TasteDNA {
  dimensions: { name: string; value: number; confidence: 'Low' | 'Medium' | 'High' }[];
  basis: number;
}

const DNA_KEYWORDS: Record<string, { positive: string[]; negative: string[] }> = {
  Cerebral: { positive: ['philosophy', 'mind', 'psychology', 'intellectual', 'complex', 'nonlinear', 'psychological'], negative: ['slapstick', 'parody'] },
  Dark: { positive: ['dark', 'dystopia', 'murder', 'noir', 'bleak', 'revenge', 'serial killer', 'death'], negative: ['feel good', 'heartwarming', 'christmas'] },
  Experimental: { positive: ['surreal', 'experimental', 'nonlinear', 'avant garde', 'anthology', 'ambiguous'], negative: ['formulaic'] },
  'Slow Burn': { positive: ['slow burn', 'atmospheric', 'character study', 'meditative', 'contemplative'], negative: ['fast paced', 'action packed'] },
  Serialized: { positive: ['serialized', 'conspiracy', 'mythology', 'mystery'], negative: ['procedural', 'episodic'] },
  Obscure: { positive: [], negative: [] }
};

export function computeTasteDNA(rated: { meta: TitleMeta; rating: number }[]): TasteDNA {
  const strong = rated.filter((r) => r.rating >= 3.5);
  const basis = strong.length;
  const dims: TasteDNA['dimensions'] = [];
  const conf = (n: number): 'Low' | 'Medium' | 'High' => (n >= 15 ? 'High' : n >= 6 ? 'Medium' : 'Low');
  for (const [name, sets] of Object.entries(DNA_KEYWORDS)) {
    if (name === 'Obscure') continue;
    let score = 0; let n = 0;
    for (const { meta, rating } of strong) {
      const kw = meta.keywords.map((k) => k.toLowerCase());
      const ov = (meta.overview ?? '').toLowerCase();
      let hit = 0; let miss = 0;
      for (const p of sets.positive) if (kw.some((k) => k.includes(p)) || ov.includes(p)) hit++;
      for (const neg of sets.negative) if (kw.some((k) => k.includes(neg))) miss++;
      if (hit + miss > 0) { score += (hit / (hit + miss)) * rating; n += rating; }
    }
    dims.push({ name, value: n > 0 ? Math.round((score / n) * 100) : 50, confidence: conf(basis) });
  }
  // Obscurity from popularity of loved titles
  if (strong.length) {
    const avgPop = strong.reduce((a, r) => a + (r.meta.popularity ?? 30) * r.rating, 0) / strong.reduce((a, r) => a + r.rating, 0);
    dims.push({ name: 'Obscure', value: Math.round(Math.max(0, Math.min(100, 100 - (Math.log10(avgPop + 1) / 2.6) * 100))), confidence: conf(basis) });
  }
  // Serialized: TV fraction among loved
  const tvShare = strong.length ? strong.filter((r) => r.meta.mediaType === 'tv').length / strong.length : 0.5;
  const serIdx = dims.findIndex((d) => d.name === 'Serialized');
  const serVal = Math.round((dims[serIdx]?.value ?? 50) * 0.5 + tvShare * 100 * 0.5);
  if (serIdx >= 0) dims[serIdx] = { name: 'Serialized', value: serVal, confidence: conf(basis) };
  return { dimensions: dims, basis };
}

// --- Source alignment: Pearson correlation between source scores and user ratings ---
export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 8) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx; const b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export interface SourceAlignment { source: string; correlation: number | null; sample: number }

export function computeSourceAlignment(rated: { meta: TitleMeta; rating: number }[]): SourceAlignment[] {
  const tmdbPairs = rated.filter((r) => r.meta.voteAverage && r.meta.voteCount && r.meta.voteCount >= 20);
  const xs = tmdbPairs.map((r) => (r.meta.voteAverage as number));
  const ys = tmdbPairs.map((r) => r.rating);
  return [
    { source: 'TMDB', correlation: pearson(xs, ys), sample: xs.length },
    { source: 'IMDb', correlation: null, sample: 0 },
    { source: 'Letterboxd', correlation: null, sample: 0 },
    { source: 'Rotten Tomatoes', correlation: null, sample: 0 }
  ];
}

// --- Taste evolution: compare recent 6 months vs earlier ---
export function computeTasteEvolution(diary: DiaryEntry[], titles: Map<string, TitleMeta>, now = Date.now()): { description: string; delta: number } | null {
  const sixMonths = 183 * 86400000;
  const recent = diary.filter((d) => now - new Date(d.date).getTime() < sixMonths);
  const earlier = diary.filter((d) => now - new Date(d.date).getTime() >= sixMonths);
  if (recent.length < 10 || earlier.length < 10) return null;
  const genreShare = (arr: DiaryEntry[]) => {
    const c: Record<string, number> = {}; let total = 0;
    for (const d of arr) {
      const meta = titles.get(d.key);
      if (!meta) continue;
      for (const g of meta.genreNames) { c[g] = (c[g] ?? 0) + 1; total++; }
    }
    const out: Record<string, number> = {};
    for (const [g, n] of Object.entries(c)) out[g] = n / Math.max(1, total);
    return out;
  };
  const r = genreShare(recent); const e = genreShare(earlier);
  let bestGenre = ''; let bestDelta = 0;
  for (const g of new Set([...Object.keys(r), ...Object.keys(e)])) {
    const delta = (r[g] ?? 0) - (e[g] ?? 0);
    if (delta > bestDelta) { bestDelta = delta; bestGenre = g; }
  }
  if (bestDelta < 0.08 || !bestGenre) return null;
  return { description: `Your viewing has shifted toward ${bestGenre.toLowerCase()} over the last six months`, delta: bestDelta };
}
