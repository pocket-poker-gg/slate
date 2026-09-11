import { db } from '../storage/db';
import { getSettings, allLibrary } from '../storage/repo';
import { getTitle, popular, trending, candidateKeysFor, storeSummaries, discover } from '../providers/tmdb';
import type { Settings, TitleMeta } from '../data/types';
import { buildTasteModel } from './taste';
import { scoreCandidate, mmrRerank, isEligible, matchPct, type ScoredCandidate } from './engine';
import { explain, type Explanation } from './explain';

export interface Recommendation { scored: ScoredCandidate; explanation: Explanation }

export interface EngineContext {
  model: ReturnType<typeof buildTasteModel>;
  settings: Settings;
  libraryKeys: Map<string, import('../data/types').LibraryEntry>;
  titles: Map<string, TitleMeta>;
}

export async function buildContext(): Promise<EngineContext> {
  const [settings, library, progress, pairwise, feedback, titles] = await Promise.all([
    getSettings(), allLibrary(), db.progress.toArray(), db.pairwise.toArray(), db.recFeedback.toArray(), db.titles.toArray()
  ]);
  const titlesMap = new Map(titles.map((t) => [t.key, t]));
  const progressMap = new Map(progress.map((p) => [p.key, p]));
  const model = buildTasteModel(library, titlesMap, progressMap, pairwise, feedback, settings);
  return { model, settings, libraryKeys: new Map(library.map((e) => [e.key, e])), titles: titlesMap };
}

async function hydrateCandidates(keys: string[], region: string): Promise<TitleMeta[]> {
  const out: TitleMeta[] = [];
  const toFetch: { mediaType: 'movie' | 'tv'; id: number }[] = [];
  for (const key of keys) {
    const [m, id] = key.split(':');
    const cached = await db.titles.get(key);
    if (cached && cached.detailLevel === 'full') out.push(cached);
    else toFetch.push({ mediaType: m as 'movie' | 'tv', id: Number(id) });
  }
  // fetch details lazily, capped to avoid N+1 abuse
  const cap = toFetch.slice(0, 24);
  const results = await Promise.allSettled(cap.map((f) => getTitle(f.mediaType, f.id, region)));
  for (const r of results) if (r.status === 'fulfilled') out.push(r.value);
  return out;
}

export async function generateRecommendations(opts: {
  limit?: number;
  mediaType?: 'movie' | 'tv';
  online?: boolean;
  salt?: string;
} = {}): Promise<Recommendation[]> {
  const limit = opts.limit ?? 10;
  const ctx = await buildContext();
  const salt = opts.salt ?? new Date().toISOString().slice(0, 10);
  const candidateKeySet = new Set<string>();

  if (opts.online !== false) {
    try {
      const seedKeys = ctx.model.positives.slice(0, 6).map((p) => p.key);
      const related = await candidateKeysFor(seedKeys);
      related.forEach((k) => candidateKeySet.add(k));
      const pop = await Promise.allSettled([
        opts.mediaType !== 'tv' ? popular('movie') : Promise.resolve([]),
        opts.mediaType !== 'movie' ? popular('tv') : Promise.resolve([]),
        trending('all')
      ]);
      for (const r of pop) if (r.status === 'fulfilled') r.value.forEach((i) => candidateKeySet.add(i.key));
      // top genres discover
      const topGenres = Object.entries(ctx.model.genres).filter(([, w]) => w > 0.4).slice(0, 2).map(([g]) => g);
      if (topGenres.length) {
        const genreIds = await genreIdsByName(topGenres);
        if (genreIds.length) {
          const d = await discover({ mediaType: opts.mediaType ?? 'movie', genres: genreIds, voteGte: 6.5, sort: 'vote_average.desc' });
          d.forEach((i) => candidateKeySet.add(i.key));
        }
      }
    } catch { /* offline path below */ }
  }

  // offline fallback: cached catalog related to favorites
  if (candidateKeySet.size < 8) {
    for (const t of ctx.titles.values()) {
      if (t.detailLevel === 'full') {
        t.recommendations.slice(0, 5).forEach((k) => candidateKeySet.add(k));
        t.similar.slice(0, 5).forEach((k) => candidateKeySet.add(k));
      }
    }
    for (const t of ctx.titles.values()) if (t.detailLevel === 'full') candidateKeySet.add(t.key);
  }

  // filter + hydrate
  const keys = [...candidateKeySet].filter((k) => {
    if (opts.mediaType && !k.startsWith(opts.mediaType + ':')) return false;
    return isEligible({ key: k } as any, ctx.libraryKeys.get(k));
  }).slice(0, 60);
  const metas = await hydrateCandidates(keys, ctx.settings.region);

  const scored = metas.map((meta) => {
    const c = scoreCandidate(meta, ctx.model, ctx.settings, ctx.settings.dials, salt);
    return { meta, score: c.total, matchPct: matchPct(c.total), components: c };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = mmrRerank(scored, limit, 0.72 - ctx.settings.dials.familiarAdventurous * 0.25);
  return top.map((scored) => ({ scored, explanation: explain(scored, ctx.model) }));
}

async function genreIdsByName(names: string[]): Promise<number[]> {
  // genres are stored by name; map back via the static TMDB genre lists
  const { loadGenreMaps } = await import('../providers/tmdb');
  await loadGenreMaps();
  const known: Record<string, number> = {
    Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99,
    Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402,
    Mystery: 9648, Romance: 10749, 'Science Fiction': 878, 'TV Movie': 10770,
    Thriller: 53, War: 10752, Western: 37, 'Action & Adventure': 10759, Kids: 10762,
    News: 10763, Reality: 10764, 'Sci-Fi & Fantasy': 10765, Soap: 10766, Talk: 10767,
    'War & Politics': 10768
  };
  return names.map((n) => known[n]).filter((n): n is number => n !== undefined);
}

// One Perfect Pick: a single confident recommendation with novelty + low recency bias
export async function onePerfectPick(filters?: TonightFilters): Promise<Recommendation | null> {
  const recs = await tonightRecommendations({ ...(filters ?? {}), limit: 24 });
  if (!recs.length) return null;
  const recent = new Set((await db.recFeedback.toArray()).filter((f) => Date.now() - f.at < 3 * 24 * 3600e3 && (f.kind === 'skip' || f.kind === 'dismiss')).map((f) => f.key));
  const fresh = recs.filter((r) => !recent.has(r.scored.meta.key));
  const pool = fresh.length ? fresh : recs;
  // weighted pick among the top 5, deterministic per day
  const daySalt = new Date().toISOString().slice(0, 10);
  const top = pool.slice(0, 5);
  let h = 0; for (const ch of daySalt) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return top[h % Math.min(3, top.length)];
}

export interface TonightFilters {
  time?: 'lt30' | 'h1' | 'h2' | 'any';
  mood?: 'cerebral' | 'intense' | 'comforting' | 'funny' | 'dark' | 'weird' | 'emotional' | 'thrilling' | 'background' | 'immersive';
  format?: 'movie' | 'tv' | 'either';
  commitment?: 'one_sitting' | 'miniseries' | 'short_series' | 'any';
  energy?: 'tired' | 'normal' | 'focused';
  providersOnly?: boolean;
  limit?: number;
}

const MOOD_GENRES: Record<string, string[]> = {
  cerebral: ['Mystery', 'Science Fiction', 'Drama', 'Sci-Fi & Fantasy'],
  intense: ['Thriller', 'Crime', 'Action', 'War'],
  comforting: ['Comedy', 'Family', 'Animation', 'Romance'],
  funny: ['Comedy'],
  dark: ['Crime', 'Thriller', 'Horror', 'Mystery', 'Drama'],
  weird: ['Science Fiction', 'Fantasy', 'Mystery', 'Sci-Fi & Fantasy'],
  emotional: ['Drama', 'Romance'],
  thrilling: ['Thriller', 'Action', 'Adventure', 'Crime'],
  background: ['Comedy', 'Reality', 'Talk'],
  immersive: ['Drama', 'Adventure', 'Fantasy', 'Science Fiction', 'Sci-Fi & Fantasy']
};

export function tonightPass(meta: TitleMeta, f: TonightFilters): boolean {
  if (f.format && f.format !== 'either' && meta.mediaType !== f.format) return false;
  const epRuntime = meta.episodeRuntimes[0] ?? 45;
  const minutes = meta.mediaType === 'movie' ? meta.runtime : epRuntime;
  if (f.time && f.time !== 'any') {
    const cap = f.time === 'lt30' ? 30 : f.time === 'h1' ? 65 : 130;
    if (minutes && minutes > cap) return false;
    if (meta.mediaType === 'movie' && !minutes && f.time === 'lt30') return false;
  }
  if (f.commitment && f.commitment !== 'any' && meta.mediaType === 'tv') {
    const seasons = meta.numberOfSeasons ?? 99;
    const eps = meta.numberOfEpisodes ?? 99;
    if (f.commitment === 'miniseries' && !(seasons === 1 && eps <= 10)) return false;
    if (f.commitment === 'short_series' && seasons > 3) return false;
    if (f.commitment === 'one_sitting' && !(seasons === 1 && eps <= 8)) return false;
  }
  if (f.commitment === 'one_sitting' && meta.mediaType === 'movie' && meta.runtime && meta.runtime > 180) return false;
  if (f.mood) {
    const wanted = MOOD_GENRES[f.mood] ?? [];
    if (wanted.length && !meta.genreNames.some((g) => wanted.includes(g))) return false;
  }
  if (f.providersOnly && meta.providers?.flatrate?.length === 0) return false;
  return true;
}

export async function tonightRecommendations(f: TonightFilters): Promise<Recommendation[]> {
  const limit = f.limit ?? 7;
  const recs = await generateRecommendations({ limit: 40, mediaType: f.format === 'either' ? undefined : f.format });
  let filtered = recs.filter((r) => tonightPass(r.scored.meta, f));
  if (f.providersOnly) {
    const mine = new Set((await getSettings()).watchProviders);
    if (mine.size) filtered = filtered.filter((r) => r.scored.meta.providers?.flatrate?.some((pv) => mine.has(pv.id)));
  }
  // energy adjustment: tired favors high commitmentFit (short) + comfort
  if (f.energy === 'tired') {
    filtered = filtered.map((r) => ({ ...r, scored: { ...r.scored, score: r.scored.score * 0.85 + r.scored.components.commitmentFit * 0.15 } }));
    filtered.sort((a, b) => b.scored.score - a.scored.score);
  }
  if (f.energy === 'focused') {
    filtered = filtered.map((r) => ({ ...r, scored: { ...r.scored, score: r.scored.score * 0.9 + r.scored.components.qualityPrior * 0.1 } }));
    filtered.sort((a, b) => b.scored.score - a.scored.score);
  }
  return filtered.slice(0, limit);
}

export { storeSummaries };
