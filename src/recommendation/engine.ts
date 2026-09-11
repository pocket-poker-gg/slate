import type { DiscoveryDials, LibraryEntry, Settings, TitleMeta } from '../data/types';
import { tasteSimilarity, type TasteModel } from './taste';

export interface ScoredCandidate {
  meta: TitleMeta;
  score: number; // 0..1 final
  matchPct: number;
  components: ScoreComponents;
}

export interface ScoreComponents {
  tasteSimilarity: number;
  qualityPrior: number;
  keywordAffinity: number;
  creatorAffinity: number;
  completionFit: number;
  commitmentFit: number;
  availabilityFit: number;
  novelty: number;
  exploration: number;
  negativePenalty: number;
}

export const WEIGHTS = {
  tasteSimilarity: 0.30,
  qualityPrior: 0.15,
  keywordAffinity: 0.12,
  creatorAffinity: 0.10,
  completionFit: 0.08,
  commitmentFit: 0.08,
  availabilityFit: 0.07,
  novelty: 0.05,
  exploration: 0.05
};

export function qualityPrior(meta: TitleMeta): number {
  const R = meta.voteAverage ?? 0;
  const v = meta.voteCount ?? 0;
  const m = 300; // minimum votes
  const C = 6.5; // global mean
  const bayes = (v / (v + m)) * R + (m / (v + m)) * C; // 0..10
  return Math.max(0, Math.min(1, bayes / 10));
}

function mapAffinity(map: Record<string, number>, names: string[]): number {
  if (!names.length) return 0.5;
  let s = 0;
  for (const n of names) s += map[n] ?? 0;
  return (Math.tanh(s) + 1) / 2;
}

export function completionFit(meta: TitleMeta, model: TasteModel): number {
  if (meta.mediaType !== 'tv' || !meta.numberOfSeasons) return 0.5;
  const done = model.completedSeriesSeasons;
  if (!done.length) return 0.5;
  const median = [...done].sort((a, b) => a - b)[Math.floor(done.length / 2)];
  const diff = Math.abs(meta.numberOfSeasons - median);
  return Math.max(0.1, 1 - diff * 0.18);
}

export function commitmentFit(meta: TitleMeta, model: TasteModel, dials?: DiscoveryDials): number {
  const totalMinutes = meta.mediaType === 'movie'
    ? meta.runtime
    : meta.numberOfEpisodes && (meta.episodeRuntimes[0] ?? 45)
      ? meta.numberOfEpisodes * (meta.episodeRuntimes[0] ?? 45)
      : undefined;
  if (!totalMinutes) return 0.5;
  const patience = dials ? dials.immediateSlowburn : 0.5; // 0 = wants short, 1 = open to long
  // acceptable window grows with patience
  const idealMax = 120 + patience * 6000; // minutes
  if (totalMinutes <= idealMax) {
    const shortBonus = Math.max(0, 1 - totalMinutes / idealMax) * 0.3;
    return 0.7 + shortBonus;
  }
  return Math.max(0.1, 1 - (totalMinutes - idealMax) / 3000);
}

export function availabilityFit(meta: TitleMeta, settings?: Settings): number {
  const providers = settings?.watchProviders ?? [];
  const p = meta.providers;
  if (!p) return 0.4;
  if (providers.length && p.flatrate?.some((x) => providers.includes(x.id))) return 1;
  if (!providers.length && p.flatrate?.length) return 0.85;
  if (p.flatrate?.length) return 0.5;
  if (p.rent?.length || p.buy?.length) return 0.4;
  return 0.3;
}

export function novelty(meta: TitleMeta): number {
  const pop = meta.popularity ?? 20;
  return Math.max(0, Math.min(1, 1 - Math.log10(pop + 1) / 2.6));
}

export function exploration(key: string, salt: string): number {
  // deterministic per-day pseudo-random
  let h = 2166136261;
  const s = key + '|' + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

export function negativePenalty(meta: TitleMeta, model: TasteModel): number {
  let pen = 0;
  for (const g of meta.genreNames) { const w = model.genres[g] ?? 0; if (w < 0) pen += -w * 0.4; }
  for (const k of meta.keywords.slice(0, 15)) { const w = model.keywords[k.toLowerCase()] ?? 0; if (w < 0) pen += -w * 0.25; }
  for (const c of meta.crew) { const w = model.creators[c.name] ?? 0; if (w < 0) pen += -w * 0.3; }
  return Math.min(0.6, pen);
}

export function scoreCandidate(meta: TitleMeta, model: TasteModel, settings?: Settings, dials?: DiscoveryDials, salt = ''): ScoreComponents & { total: number } {
  const c: ScoreComponents = {
    tasteSimilarity: tasteSimilarity(meta, model),
    qualityPrior: qualityPrior(meta),
    keywordAffinity: mapAffinity(model.keywords, meta.keywords.slice(0, 15).map((k) => k.toLowerCase())),
    creatorAffinity: mapAffinity(model.creators, meta.crew.filter((x) => ['Director', 'Creator', 'Writer', 'Screenplay'].includes(x.job)).map((x) => x.name)),
    completionFit: completionFit(meta, model),
    commitmentFit: commitmentFit(meta, model, dials),
    availabilityFit: availabilityFit(meta, settings),
    novelty: novelty(meta),
    exploration: exploration(meta.key, salt),
    negativePenalty: negativePenalty(meta, model)
  };
  let total =
    WEIGHTS.tasteSimilarity * c.tasteSimilarity +
    WEIGHTS.qualityPrior * c.qualityPrior +
    WEIGHTS.keywordAffinity * c.keywordAffinity +
    WEIGHTS.creatorAffinity * c.creatorAffinity +
    WEIGHTS.completionFit * c.completionFit +
    WEIGHTS.commitmentFit * c.commitmentFit +
    WEIGHTS.availabilityFit * c.availabilityFit +
    WEIGHTS.novelty * c.novelty +
    WEIGHTS.exploration * c.exploration -
    c.negativePenalty;
  // dial adjustments
  if (dials) {
    total += (dials.popularHidden - 0.5) * 0.14 * (c.novelty - 0.5) * 2;
    total += (dials.familiarAdventurous - 0.5) * 0.10 * (0.5 - c.tasteSimilarity) * 2;
    total += (dials.easyCerebral - 0.5) * 0.06 * (c.qualityPrior - 0.5) * 2;
  }
  total = Math.max(0, Math.min(1, total));
  return { ...c, total };
}

// Similarity between two titles for MMR diversity
export function titleSimilarity(a: TitleMeta, b: TitleMeta): number {
  let sim = 0; let w = 0;
  const jaccard = (x: string[], y: string[]) => {
    if (!x.length || !y.length) return 0;
    const ys = new Set(y);
    const inter = x.filter((v) => ys.has(v)).length;
    return inter / (x.length + y.length - inter);
  };
  sim += jaccard(a.genreNames, b.genreNames) * 0.45; w += 0.45;
  sim += jaccard(a.keywords.map((k) => k.toLowerCase()), b.keywords.map((k) => k.toLowerCase())) * 0.25; w += 0.25;
  sim += jaccard(a.crew.map((c) => c.name), b.crew.map((c) => c.name)) * 0.2; w += 0.2;
  sim += (a.mediaType === b.mediaType ? 1 : 0) * 0.1; w += 0.1;
  return sim / w;
}

// Maximal Marginal Relevance reranking
export function mmrRerank(candidates: ScoredCandidate[], limit: number, lambda = 0.72): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const pool = [...candidates];
  while (pool.length && selected.length < limit) {
    let bestIdx = 0; let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      let maxSim = 0;
      for (const sel of selected) maxSim = Math.max(maxSim, titleSimilarity(cand.meta, sel.meta));
      const val = lambda * cand.score - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected;
}

export function isEligible(meta: TitleMeta, entry: LibraryEntry | undefined): boolean {
  if (!entry) return true;
  if (entry.notInterested) return false;
  if (entry.status === 'watched' || entry.status === 'dropped') return false;
  if (entry.dismissedCount >= 2) return false;
  return true;
}

export function matchPct(score: number): number {
  return Math.round(55 + score * 43); // 55..98
}
