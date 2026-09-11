import type { LibraryEntry, PairwiseChoice, ProgressEntry, RecFeedback, Settings, TitleMeta } from '../data/types';

export interface TasteModel {
  builtAt: number;
  signalCount: number;
  genres: Record<string, number>;
  keywords: Record<string, number>;
  creators: Record<string, number>;
  cast: Record<string, number>;
  networks: Record<string, number>;
  companies: Record<string, number>;
  decades: Record<string, number>;
  languages: Record<string, number>;
  ratingMean: number;
  ratingSd: number;
  preferredMovieRuntime?: number; // minutes, weighted avg of highly rated movies
  completedSeriesSeasons: number[]; // season counts of series the user finished
  droppedSeriesSeasons: number[];
  seriesCompletionRate?: number; // 0..1
  positives: { key: string; title: string; rating?: number; weight: number }[]; // strongest loved titles
  negatives: { key: string; title: string; weight: number }[];
}

const clampW = (v: number) => Math.max(-1, Math.min(1, v));

export function entrySignal(e: LibraryEntry): number {
  let s = 0;
  if (e.rating !== undefined) s += ((e.rating - 3) / 2) * 0.9; // -0.9..0.9
  if (e.favorite) s += 0.7;
  if (e.status === 'watchlist') s += 0.25;
  if (e.status === 'watching') s += 0.35;
  if (e.watchSoon) s += 0.3;
  if (e.status === 'watched' && e.rating === undefined) s += 0.15;
  if (e.status === 'dropped') s -= 0.55;
  if (e.status === 'paused') s -= 0.1;
  if (e.notInterested) s -= 1;
  if (e.watchCount > 1) s += 0.15 * Math.min(3, e.watchCount - 1);
  if (e.review) s += 0.05;
  if (e.dismissedCount > 0) s -= 0.2 * Math.min(3, e.dismissedCount);
  return clampW(s);
}

function addWeighted(acc: Record<string, number>, key: string | undefined, weight: number) {
  if (!key) return;
  acc[key] = (acc[key] ?? 0) + weight;
}

function normalizeMap(m: Record<string, number>): Record<string, number> {
  const vals = Object.values(m).map(Math.abs);
  const max = Math.max(0.0001, ...vals);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) out[k] = clampW(v / max);
  return out;
}

export function buildTasteModel(
  library: LibraryEntry[],
  titles: Map<string, TitleMeta>,
  progress: Map<string, ProgressEntry>,
  pairwise: PairwiseChoice[],
  feedback: RecFeedback[],
  _settings?: Settings
): TasteModel {
  const genres: Record<string, number> = {};
  const keywords: Record<string, number> = {};
  const creators: Record<string, number> = {};
  const cast: Record<string, number> = {};
  const networks: Record<string, number> = {};
  const companies: Record<string, number> = {};
  const decades: Record<string, number> = {};
  const languages: Record<string, number> = {};
  const ratings: number[] = [];
  const positives: TasteModel['positives'] = [];
  const negatives: TasteModel['negatives'] = [];
  const completedSeriesSeasons: number[] = [];
  const droppedSeriesSeasons: number[] = [];
  let runtimeSum = 0; let runtimeW = 0;

  for (const e of library) {
    let s = entrySignal(e);
    const meta = titles.get(e.key);
    // pairwise adjustments
    for (const p of pairwise) {
      if (p.aKey === e.key) s += p.winner === 'a' ? 0.12 : -0.12;
      if (p.bKey === e.key) s += p.winner === 'b' ? 0.12 : -0.12;
    }
    for (const f of feedback) {
      if (f.key !== e.key) continue;
      if (f.kind === 'more') s += 0.25;
      if (f.kind === 'less' || f.kind === 'not_interested') s -= 0.3;
    }
    s = clampW(s);
    if (Math.abs(s) < 0.05) continue;
    if (e.rating !== undefined) ratings.push(e.rating);
    if (!meta) continue;
    const w = s;
    for (const g of meta.genreNames) addWeighted(genres, g, w);
    for (const k of meta.keywords.slice(0, 15)) addWeighted(keywords, k.toLowerCase(), w * 0.8);
    for (const c of meta.crew) if (['Director', 'Creator', 'Writer', 'Screenplay'].includes(c.job)) addWeighted(creators, c.name, w * 0.9);
    for (const c of meta.cast.slice(0, 6)) addWeighted(cast, c.name, w * 0.4);
    for (const n of meta.networks) addWeighted(networks, n, w * 0.6);
    for (const c of meta.companies.slice(0, 4)) addWeighted(companies, c, w * 0.3);
    if (meta.year) addWeighted(decades, `${Math.floor(meta.year / 10) * 10}s`, w * 0.5);
    if (meta.originalLanguage) addWeighted(languages, meta.originalLanguage, w * 0.3);
    if (meta.mediaType === 'movie' && meta.runtime && s > 0.3) { runtimeSum += meta.runtime * s; runtimeW += s; }
    if (meta.mediaType === 'tv' && meta.numberOfSeasons) {
      const p = progress.get(e.key);
      const watchedCount = p ? Object.keys(p.episodes).length : 0;
      const finished = e.status === 'watched' || (meta.numberOfEpisodes ? watchedCount >= meta.numberOfEpisodes : false);
      if (finished) completedSeriesSeasons.push(meta.numberOfSeasons);
      if (e.status === 'dropped') droppedSeriesSeasons.push(meta.numberOfSeasons);
    }
    if (s > 0.4) positives.push({ key: e.key, title: meta.title, rating: e.rating, weight: s });
    if (s < -0.3) negatives.push({ key: e.key, title: meta.title, weight: s });
  }

  const ratingMean = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 3.5;
  const ratingSd = ratings.length > 1 ? Math.sqrt(ratings.reduce((a, b) => a + (b - ratingMean) ** 2, 0) / ratings.length) : 0.8;
  const totalSeries = completedSeriesSeasons.length + droppedSeriesSeasons.length;

  positives.sort((a, b) => b.weight - a.weight);
  negatives.sort((a, b) => a.weight - b.weight);

  return {
    builtAt: Date.now(),
    signalCount: ratings.length + pairwise.length,
    genres: normalizeMap(genres),
    keywords: normalizeMap(keywords),
    creators: normalizeMap(creators),
    cast: normalizeMap(cast),
    networks: normalizeMap(networks),
    companies: normalizeMap(companies),
    decades: normalizeMap(decades),
    languages: normalizeMap(languages),
    ratingMean,
    ratingSd,
    preferredMovieRuntime: runtimeW > 0 ? runtimeSum / runtimeW : undefined,
    completedSeriesSeasons,
    droppedSeriesSeasons,
    seriesCompletionRate: totalSeries >= 2 ? completedSeriesSeasons.length / totalSeries : undefined,
    positives: positives.slice(0, 12),
    negatives: negatives.slice(0, 12)
  };
}

// Similarity of a candidate to the taste model, 0..1
export function tasteSimilarity(meta: TitleMeta, model: TasteModel): number {
  let score = 0; let weight = 0;
  const accum = (map: Record<string, number>, names: string[], w: number) => {
    if (!names.length) return;
    let local = 0;
    for (const n of names) local += map[n] ?? 0;
    score += Math.tanh(local) * w; weight += w;
  };
  accum(model.genres, meta.genreNames, 1.6);
  accum(model.keywords, meta.keywords.slice(0, 15).map((k) => k.toLowerCase()), 1.0);
  accum(model.creators, meta.crew.filter((c) => ['Director', 'Creator', 'Writer', 'Screenplay'].includes(c.job)).map((c) => c.name), 1.2);
  accum(model.cast, meta.cast.slice(0, 6).map((c) => c.name), 0.6);
  accum(model.networks, meta.networks, 0.5);
  if (meta.year) accum(model.decades, [`${Math.floor(meta.year / 10) * 10}s`], 0.3);
  if (weight === 0) return 0.5;
  const raw = score / weight; // -1..1-ish
  return (raw + 1) / 2;
}
