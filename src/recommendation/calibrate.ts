import { db } from '../storage/db';
import { buildContext } from './recommend';
import { predictRating } from './predict';
import type { TitleMeta } from '../data/types';

export interface CalPair { a: TitleMeta; b: TitleMeta }
export interface PredTitle { t: TitleMeta; pred: number }

// Pure adaptive selection: prefer pairs that resolve the most uncertainty -
// titles the model rates nearly equally (hard calls), seen rarely in past
// comparisons, never compared against each other before.
export function choosePairs(candidates: PredTitle[], compared: Set<string>, times: Map<string, number>, count: number, rand: () => number = Math.random): CalPair[] {
  // Score every valid pair, then take the best disjoint set: uncertainty first.
  const scored: { a: PredTitle; b: PredTitle; s: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const x = candidates[i];
      const y = candidates[j];
      if (x.t.mediaType !== y.t.mediaType) continue;
      if (compared.has(`${x.t.key}|${y.t.key}`)) continue;
      const closeness = 1 - Math.min(1, Math.abs(x.pred - y.pred) / 2);
      const freshness = 0.5 * (1 / (1 + (times.get(x.t.key) ?? 0)) + 1 / (1 + (times.get(y.t.key) ?? 0)));
      scored.push({ a: x, b: y, s: closeness * 0.7 + freshness * 0.3 + rand() * 0.05 });
    }
  }
  scored.sort((m, n) => n.s - m.s);
  const used = new Set<string>();
  const pairs: CalPair[] = [];
  for (const c of scored) {
    if (pairs.length >= count) break;
    if (used.has(c.a.t.key) || used.has(c.b.t.key)) continue;
    pairs.push({ a: c.a.t, b: c.b.t });
    used.add(c.a.t.key);
    used.add(c.b.t.key);
  }
  return pairs;
}

export async function pickCalibrationPairs(count = 8): Promise<CalPair[]> {
  const [ctx, pairwise] = await Promise.all([buildContext(), db.pairwise.toArray()]);
  const compared = new Set<string>();
  const times = new Map<string, number>();
  for (const p of pairwise) {
    compared.add(`${p.aKey}|${p.bKey}`);
    compared.add(`${p.bKey}|${p.aKey}`);
    times.set(p.aKey, (times.get(p.aKey) ?? 0) + 1);
    times.set(p.bKey, (times.get(p.bKey) ?? 0) + 1);
  }
  // Only pair titles the user can realistically judge: in their library, or
  // well-known enough (vote count as a familiarity proxy).
  const pool = [...ctx.titles.values()]
    .filter((t) => t.detailLevel === 'full' && t.posterPath && (ctx.libraryKeys.has(t.key) || (t.voteCount ?? 0) >= 300))
    .slice(0, 250)
    .map((t) => ({ t, pred: predictRating(t, ctx.model).rating }));
  return choosePairs(pool, compared, times, count);
}

export async function recordCalibration(aKey: string, bKey: string, winner: 'a' | 'b'): Promise<void> {
  await db.pairwise.add({ aKey, bKey, winner, at: Date.now() });
}
