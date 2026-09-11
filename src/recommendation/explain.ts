import type { TitleMeta } from '../data/types';
import type { TasteModel } from './taste';
import type { ScoredCandidate } from './engine';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Explanation {
  matchPct: number;
  headline: string;
  reasons: string[];
}

export function explain(scored: ScoredCandidate, model: TasteModel): Explanation {
  const meta = scored.meta;
  const c = scored.components;
  const reasons: string[] = [];

  // Find loved titles sharing the most features with this candidate
  const shared: { title: string; rating?: number; overlap: number }[] = [];
  for (const pos of model.positives) {
    // positives only carry key/title/rating; overlap computed by caller-provided map where possible
    shared.push({ title: pos.title, rating: pos.rating, overlap: pos.weight });
  }

  const genreHits = meta.genreNames.filter((g) => (model.genres[g] ?? 0) > 0.25);
  const keywordHits = meta.keywords.filter((k) => (model.keywords[k.toLowerCase()] ?? 0) > 0.3).slice(0, 4);
  const creatorHits = meta.crew.filter((x) => ['Director', 'Creator', 'Writer', 'Screenplay'].includes(x.job) && (model.creators[x.name] ?? 0) > 0.2).map((x) => x.name);
  const castHits = meta.cast.filter((x) => (model.cast[x.name] ?? 0) > 0.3).map((x) => x.name).slice(0, 2);

  const loved = model.positives.slice(0, 2);
  let headline: string;
  if (loved.length && c.tasteSimilarity > 0.6) {
    const phrased = loved.map((l) => (l.rating ? `${l.title} (${formatRating(l.rating)})` : l.title)).join(' and ');
    headline = `Because you loved ${phrased}`;
  } else if (genreHits.length) {
    headline = `Strong ${genreHits.slice(0, 2).join(' & ').toLowerCase()} match for your taste`;
  } else if (c.qualityPrior > 0.75) {
    headline = 'Highly rated and worth your time';
  } else {
    headline = 'A promising pick for you';
  }

  if (genreHits.length) reasons.push(`Matches your taste for ${genreHits.slice(0, 3).join(', ').toLowerCase()}`);
  if (keywordHits.length) reasons.push(`Shares themes you respond to: ${keywordHits.join(', ')}`);
  if (creatorHits.length) reasons.push(`From ${creatorHits.slice(0, 2).join(' and ')}, whose work you rate highly`);
  if (castHits.length) reasons.push(`Features ${castHits.join(' and ')}`);
  if (c.commitmentFit > 0.75 && meta.mediaType === 'tv' && meta.numberOfSeasons) {
    reasons.push(`A ${meta.numberOfSeasons}-season commitment sits inside your usual completion range`);
  }
  if (c.commitmentFit > 0.75 && meta.mediaType === 'movie' && meta.runtime) {
    reasons.push(`At ${Math.round(meta.runtime / 60 * 10) / 10}h it fits the length you tend to enjoy`);
  }
  if (c.availabilityFit >= 1) reasons.push('Streaming on one of your services now');
  if (c.novelty > 0.7) reasons.push('Off the beaten path - a genuine hidden gem candidate');
  if (meta.voteAverage && meta.voteCount && meta.voteCount > 500) reasons.push(`Audiences rate it ${meta.voteAverage.toFixed(1)}/10 across ${compact(meta.voteCount)} votes`);

  return { matchPct: scored.matchPct, headline: cap(headline), reasons: reasons.slice(0, 4) };
}

const formatRating = (r: number) => `${r} star${r === 1 ? '' : 's'}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
