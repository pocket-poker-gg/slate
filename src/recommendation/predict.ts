import type { TitleMeta } from '../data/types';
import type { TasteModel } from './taste';
import { qualityPrior, completionFit } from './engine';
import { tasteSimilarity } from './taste';

export interface Prediction { rating: number; confidence: 'Low' | 'Medium' | 'High'; basis: number }

// Predicted personal rating for an unseen title.
export function predictRating(meta: TitleMeta, model: TasteModel): Prediction {
  const sim = tasteSimilarity(meta, model); // 0..1
  const q = qualityPrior(meta); // 0..1
  // Blend: quality anchors to 0..10 scale mapped into 1..5, taste shifts around user mean
  const qualityStars = 1 + q * 4;
  const tasteShift = (sim - 0.5) * 2 * Math.max(0.8, model.ratingSd); // scaled by user spread
  let predicted = model.signalCount >= 5
    ? 0.45 * qualityStars + 0.55 * (model.ratingMean + tasteShift)
    : qualityStars;
  predicted = Math.max(0.5, Math.min(5, predicted));
  const overlap = sim > 0.35 ? 1 : sim > 0.2 ? 0.5 : 0.2;
  const basis = Math.min(1, model.signalCount / 25) * overlap * (meta.voteCount && meta.voteCount > 200 ? 1 : 0.6);
  return {
    rating: Math.round(predicted * 10) / 10,
    confidence: basis > 0.6 ? 'High' : basis > 0.25 ? 'Medium' : 'Low',
    basis
  };
}

// Probability the user finishes a series (documented heuristic, not ML).
export function finishLikelihood(meta: TitleMeta, model: TasteModel): { pct: number; note?: string } | null {
  if (meta.mediaType !== 'tv') return null;
  const rate = model.seriesCompletionRate;
  const seasons = meta.numberOfSeasons ?? 1;
  let p = rate !== undefined ? rate : 0.6;
  const completed = model.completedSeriesSeasons;
  let note: string | undefined;
  if (completed.length) {
    const median = [...completed].sort((a, b) => a - b)[Math.floor(completed.length / 2)];
    if (seasons <= median) { p += 0.12; note = `You usually finish series around ${median} season${median === 1 ? '' : 's'}`; }
    else p -= Math.min(0.3, (seasons - median) * 0.09);
  }
  if (meta.status === 'Ended' || meta.status === 'Canceled') p += 0.04; // completable
  const sim = tasteSimilarity(meta, model);
  p += (sim - 0.5) * 0.2;
  p = Math.max(0.05, Math.min(0.97, p));
  if (model.signalCount < 4) return null;
  return { pct: Math.round(p * 100), note };
}

// Commitment efficiency: predicted enjoyment per hour. Higher = better value.
export function commitmentValue(meta: TitleMeta, model: TasteModel): { value: number; totalMinutes?: number } {
  const pred = predictRating(meta, model).rating;
  const epRuntime = meta.episodeRuntimes[0] ?? 45;
  const totalMinutes = meta.mediaType === 'movie'
    ? meta.runtime
    : meta.numberOfEpisodes ? meta.numberOfEpisodes * epRuntime : undefined;
  if (!totalMinutes || totalMinutes <= 0) return { value: pred / 2, totalMinutes };
  const hours = totalMinutes / 60;
  return { value: Math.round((pred / Math.pow(hours, 0.55)) * 100) / 100, totalMinutes };
}

export function formatCommitment(meta: TitleMeta): string | null {
  const ep = meta.episodeRuntimes[0] ?? 45;
  if (meta.mediaType === 'movie') {
    if (!meta.runtime) return null;
    const h = Math.floor(meta.runtime / 60); const m = meta.runtime % 60;
    return h ? `${h}h ${m ? `${m}m` : ''}`.trim() : `${m}m`;
  }
  if (!meta.numberOfEpisodes) return null;
  const totalMin = meta.numberOfEpisodes * ep;
  const h = Math.round(totalMin / 60);
  const seasons = meta.numberOfSeasons ? `${meta.numberOfSeasons} season${meta.numberOfSeasons === 1 ? '' : 's'}` : '';
  return `${meta.numberOfEpisodes} episodes${seasons ? ` · ${seasons}` : ''} · ~${h}h total`;
}
