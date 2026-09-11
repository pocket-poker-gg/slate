import { TMDB_API_KEY, TMDB_API_BASE } from '../data/config';
import { db } from '../storage/db';
import { titleKey, type MediaType, type TitleMeta, type SeasonSummary, type ProviderBlock, type WatchProviderInfo } from '../data/types';

const DAY = 24 * 60 * 60 * 1000;
const OVERRIDE_KEY = 'slate.tmdbKeyOverride';
export function getTmdbKeyOverride(): string { try { return localStorage.getItem(OVERRIDE_KEY) || ''; } catch { return ''; } }
export function setTmdbKeyOverride(k: string) { try { const v = k.trim(); if (v) localStorage.setItem(OVERRIDE_KEY, v); else localStorage.removeItem(OVERRIDE_KEY); } catch { /* storage unavailable */ } }
const activeKey = () => getTmdbKeyOverride() || TMDB_API_KEY;
const TTL = { detail: 14 * DAY, search: 6 * 60 * 60 * 1000, list: 12 * 60 * 60 * 1000, providers: 3 * DAY, season: 7 * DAY };

export class OfflineError extends Error { constructor() { super('offline'); this.name = 'OfflineError'; } }
export class ApiError extends Error { status: number; constructor(s: number) { super(`TMDB ${s}`); this.status = s; this.name = 'ApiError'; } }

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine;

async function cachedJson<T = any>(path: string, params: Record<string, string | number | undefined>, ttl: number): Promise<T> {
  const usp = new URLSearchParams();
  usp.set('api_key', activeKey());
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') usp.set(k, String(v));
  const url = `${TMDB_API_BASE}${path}?${usp.toString()}`;
  const now = Date.now();
  try {
    const row = await db.metaCache.get(url);
    if (row && row.expiresAt > now) return row.data as T;
  } catch { /* cache unavailable */ }
  if (!isOnline()) {
    try {
      const stale = await db.metaCache.get(url);
      if (stale) return stale.data as T;
    } catch { /* ignore */ }
    throw new OfflineError();
  }
  const res = await fetch(url);
  if (res.status === 404) throw new ApiError(404);
  if (!res.ok) throw new ApiError(res.status);
  const data = (await res.json()) as T;
  try { await db.metaCache.put({ url, data, fetchedAt: now, expiresAt: now + ttl }); } catch { /* quota */ }
  return data;
}

export interface SearchResultItem {
  key: string; tmdbId: number; mediaType: MediaType; title: string; year?: number;
  posterPath?: string | null; voteAverage?: number; voteCount?: number; overview?: string;
  genreIds: number[]; popularity?: number;
}
export interface PersonResultItem { id: number; name: string; knownFor?: string; profilePath?: string | null }
export interface SearchResults { items: SearchResultItem[]; people: PersonResultItem[]; totalResults: number }

let movieGenreMap: Record<number, string> = {};
let tvGenreMap: Record<number, string> = {};

export async function loadGenreMaps(): Promise<void> {
  try {
    const [m, t] = await Promise.all([
      cachedJson<{ genres: { id: number; name: string }[] }>('/genre/movie/list', {}, TTL.detail),
      cachedJson<{ genres: { id: number; name: string }[] }>('/genre/tv/list', {}, TTL.detail)
    ]);
    movieGenreMap = Object.fromEntries(m.genres.map((g) => [g.id, g.name]));
    tvGenreMap = Object.fromEntries(t.genres.map((g) => [g.id, g.name]));
  } catch { /* offline: empty maps acceptable */ }
}
export const genreName = (mediaType: MediaType, id: number) => (mediaType === 'movie' ? movieGenreMap : tvGenreMap)[id] ?? '';

function mapSummary(mediaType: MediaType, r: any): SearchResultItem {
  const title = mediaType === 'movie' ? r.title : r.name;
  const date = mediaType === 'movie' ? r.release_date : r.first_air_date;
  return {
    key: titleKey(mediaType, r.id),
    tmdbId: r.id,
    mediaType,
    title: title ?? r.original_title ?? r.original_name ?? 'Untitled',
    year: date ? Number(String(date).slice(0, 4)) : undefined,
    posterPath: r.poster_path ?? null,
    voteAverage: r.vote_average,
    voteCount: r.vote_count,
    overview: r.overview,
    genreIds: r.genre_ids ?? [],
    popularity: r.popularity
  };
}

function storeSummary(meta: SearchResultItem) {
  const existing = db.titles.get(meta.key);
  const base: TitleMeta = {
    key: meta.key, tmdbId: meta.tmdbId, mediaType: meta.mediaType, title: meta.title,
    year: meta.year, posterPath: meta.posterPath, overview: meta.overview,
    genres: meta.genreIds, genreNames: meta.genreIds.map((g) => genreName(meta.mediaType, g)).filter(Boolean),
    keywords: [], cast: [], crew: [], networks: [], companies: [], originCountry: [],
    episodeRuntimes: [], seasons: [], recommendations: [], similar: [],
    voteAverage: meta.voteAverage, voteCount: meta.voteCount, popularity: meta.popularity,
    fetchedAt: Date.now(), detailLevel: 'summary'
  };
  return existing.then((row) => { if (!row) return db.titles.put(base); });
}

export async function storeSummaries(items: SearchResultItem[]) {
  await Promise.all(items.map(storeSummary));
}

export async function searchMulti(query: string, page = 1): Promise<SearchResults> {
  const data = await cachedJson<any>('/search/multi', { query, page, include_adult: 'false' }, TTL.search);
  const items: SearchResultItem[] = [];
  const people: PersonResultItem[] = [];
  for (const r of data.results ?? []) {
    if (r.media_type === 'movie' || r.media_type === 'tv') items.push(mapSummary(r.media_type, r));
    else if (r.media_type === 'person') people.push({ id: r.id, name: r.name, knownFor: r.known_for_department, profilePath: r.profile_path ?? null });
  }
  await storeSummaries(items);
  return { items, people, totalResults: data.total_results ?? items.length };
}

export async function trending(kind: 'movie' | 'tv' | 'all' = 'all'): Promise<SearchResultItem[]> {
  const data = await cachedJson<any>(`/trending/${kind}/week`, {}, TTL.list);
  const items = (data.results ?? []).filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv').map((r: any) => mapSummary(r.media_type, r));
  await storeSummaries(items);
  return items;
}

export async function popular(mediaType: MediaType, page = 1): Promise<SearchResultItem[]> {
  const data = await cachedJson<any>(`/${mediaType}/popular`, { page }, TTL.list);
  const items = (data.results ?? []).map((r: any) => mapSummary(mediaType, r));
  await storeSummaries(items);
  return items;
}

export async function topRated(mediaType: MediaType, page = 1): Promise<SearchResultItem[]> {
  const data = await cachedJson<any>(`/${mediaType}/top_rated`, { page }, TTL.list);
  const items = (data.results ?? []).map((r: any) => mapSummary(mediaType, r));
  await storeSummaries(items);
  return items;
}

export interface DiscoverParams {
  mediaType: MediaType; page?: number; genres?: number[]; yearGte?: number; yearLte?: number;
  voteGte?: number; voteCountGte?: number; runtimeLte?: number; runtimeGte?: number; language?: string; tvType?: number;
  providers?: number[]; status?: string; sort?: string; keywords?: number[];
}
export interface Paged { items: SearchResultItem[]; page: number; totalPages: number; totalResults: number }
export async function discover(p: DiscoverParams): Promise<Paged> {
  const params: Record<string, string | number | undefined> = {
    page: p.page ?? 1,
    sort_by: p.sort ?? 'popularity.desc',
    'with_genres': p.genres?.join('|'),
    'primary_release_date.gte': p.mediaType === 'movie' && p.yearGte ? `${p.yearGte}-01-01` : undefined,
    'primary_release_date.lte': p.mediaType === 'movie' && p.yearLte ? `${p.yearLte}-12-31` : undefined,
    'first_air_date.gte': p.mediaType === 'tv' && p.yearGte ? `${p.yearGte}-01-01` : undefined,
    'first_air_date.lte': p.mediaType === 'tv' && p.yearLte ? `${p.yearLte}-12-31` : undefined,
    'vote_average.gte': p.voteGte,
    'vote_count.gte': p.voteCountGte ?? (p.voteGte ? 100 : undefined),
    'with_runtime.lte': p.runtimeLte,
    'with_runtime.gte': p.runtimeGte,
    'with_original_language': p.language,
    'with_watch_providers': p.providers?.length ? p.providers.join('|') : undefined,
    watch_region: p.providers?.length ? 'US' : undefined,
    'with_status': p.mediaType === 'tv' ? p.status : undefined,
    'with_type': p.mediaType === 'tv' ? p.tvType : undefined,
    'with_keywords': p.keywords?.join('|'),
    include_adult: 'false'
  };
  const data = await cachedJson<any>(`/discover/${p.mediaType}`, params, TTL.list);
  const items = (data.results ?? []).map((r: any) => mapSummary(p.mediaType, r));
  await storeSummaries(items);
  return { items, page: data.page ?? (p.page ?? 1), totalPages: data.total_pages ?? 1, totalResults: data.total_results ?? items.length };
}

function mapProviders(raw: any, region: string): ProviderBlock | undefined {
  const r = raw?.results?.[region] ?? raw?.results?.US;
  if (!r) return undefined;
  const mapP = (arr: any[]): WatchProviderInfo[] => (arr ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }));
  return { link: r.link, flatrate: mapP(r.flatrate), rent: mapP(r.rent), buy: mapP(r.buy), region };
}

function pickTrailer(videos: any): string | undefined {
  const list = videos?.results ?? [];
  const t = list.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
    ?? list.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer')
    ?? list.find((v: any) => v.site === 'YouTube');
  return t?.key;
}

function certification(mediaType: MediaType, d: any, region: string): string | undefined {
  if (mediaType === 'movie') {
    const rel = d.release_dates?.results ?? [];
    const entry = rel.find((r: any) => r.iso_3166_1 === region) ?? rel.find((r: any) => r.iso_3166_1 === 'US') ?? rel[0];
    const cert = entry?.release_dates?.find((x: any) => x.certification)?.certification;
    return cert || undefined;
  }
  const cr = d.content_ratings?.results ?? [];
  return (cr.find((r: any) => r.iso_3166_1 === region) ?? cr.find((r: any) => r.iso_3166_1 === 'US') ?? cr[0])?.rating || undefined;
}

export async function getTitle(mediaType: MediaType, tmdbId: number, region = 'US', force = false): Promise<TitleMeta> {
  const key = titleKey(mediaType, tmdbId);
  if (!force) {
    try {
      const cached = await db.titles.get(key);
      if (cached && cached.detailLevel === 'full' && Date.now() - cached.fetchedAt < TTL.detail) return cached;
    } catch { /* ignore */ }
  }
  const append = mediaType === 'movie'
    ? 'keywords,credits,release_dates,watch/providers,videos,recommendations,similar,external_ids'
    : 'keywords,credits,content_ratings,watch/providers,videos,recommendations,similar,external_ids';
  const d = await cachedJson<any>(`/${mediaType}/${tmdbId}`, { append_to_response: append }, TTL.detail);
  const date = mediaType === 'movie' ? d.release_date : d.first_air_date;
  const genres: number[] = (d.genres ?? []).map((g: any) => g.id);
  const keywordsRaw = mediaType === 'movie' ? d.keywords?.keywords : d.keywords?.results;
  const meta: TitleMeta = {
    key, tmdbId, mediaType,
    title: d.title ?? d.name ?? 'Untitled',
    originalTitle: d.original_title ?? d.original_name,
    year: date ? Number(String(date).slice(0, 4)) : undefined,
    releaseDate: date,
    overview: d.overview,
    tagline: d.tagline || undefined,
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    genres,
    genreNames: genres.map((g) => genreName(mediaType, g)).filter(Boolean),
    keywords: (keywordsRaw ?? []).map((k: any) => k.name).slice(0, 40),
    cast: (d.credits?.cast ?? []).slice(0, 12).map((c: any) => ({ id: c.id, name: c.name, character: c.character, order: c.order, profilePath: c.profile_path ?? null })),
    crew: (d.credits?.crew ?? []).filter((c: any) => ['Director', 'Writer', 'Screenplay', 'Creator', 'Executive Producer'].includes(c.job)).slice(0, 12).map((c: any) => ({ id: c.id, name: c.name, job: c.job })),
    voteAverage: d.vote_average, voteCount: d.vote_count, popularity: d.popularity,
    runtime: d.runtime ?? undefined,
    episodeRuntimes: d.episode_run_time ?? [],
    numberOfSeasons: d.number_of_seasons ?? undefined,
    numberOfEpisodes: d.number_of_episodes ?? undefined,
    status: d.status ?? undefined,
    nextAirDate: d.next_episode_to_air?.air_date ?? undefined,
    networks: (d.networks ?? []).map((n: any) => n.name),
    companies: (d.production_companies ?? []).map((c: any) => c.name).slice(0, 8),
    originalLanguage: d.original_language,
    originCountry: d.origin_country ?? [],
    certification: certification(mediaType, d, region),
    seasons: ((d.seasons ?? []) as any[]).filter((s) => s.season_number > 0).map((s): SeasonSummary => ({ seasonNumber: s.season_number, name: s.name, episodeCount: s.episode_count, airDate: s.air_date, posterPath: s.poster_path ?? null })),
    trailerKey: pickTrailer(d.videos),
    providers: mapProviders(d['watch/providers'], region),
    imdbId: d.external_ids?.imdb_id ?? d.imdb_id ?? undefined,
    recommendations: (d.recommendations?.results ?? []).slice(0, 20).map((r: any) => titleKey(mediaType, r.id)),
    similar: (d.similar?.results ?? []).slice(0, 20).map((r: any) => titleKey(mediaType, r.id)),
    fetchedAt: Date.now(),
    detailLevel: 'full'
  };
  await db.titles.put(meta);
  // store recommendation summaries for offline rendering
  const recSummaries = [...(d.recommendations?.results ?? []), ...(d.similar?.results ?? [])]
    .slice(0, 40).map((r: any) => mapSummary(mediaType, r));
  await storeSummaries(recSummaries);
  return meta;
}

export interface EpisodeInfo { episodeNumber: number; seasonNumber: number; name: string; overview?: string; airDate?: string; runtime?: number; stillPath?: string | null; voteAverage?: number }
export interface SeasonDetail { seasonNumber: number; name: string; overview?: string; episodes: EpisodeInfo[] }

export async function getSeason(tmdbId: number, season: number): Promise<SeasonDetail> {
  const d = await cachedJson<any>(`/tv/${tmdbId}/season/${season}`, {}, TTL.season);
  return {
    seasonNumber: d.season_number,
    name: d.name,
    overview: d.overview,
    episodes: (d.episodes ?? []).map((e: any): EpisodeInfo => ({
      episodeNumber: e.episode_number, seasonNumber: e.season_number, name: e.name,
      overview: e.overview, airDate: e.air_date, runtime: e.runtime ?? undefined,
      stillPath: e.still_path ?? null, voteAverage: e.vote_average
    }))
  };
}

// TMDB user reviews - the lawful review-text lane (served by TMDB's public
// API; we never scrape review text from IMDb/RT/Google).
export interface TmdbReview {
  id: string;
  author: string;
  rating?: number; // author score 0..10 when given
  content: string;
  createdAt?: string;
  url?: string;
}
export async function getReviews(mediaType: MediaType, tmdbId: number, max = 6): Promise<TmdbReview[]> {
  const d = await cachedJson<any>(`/${mediaType}/${tmdbId}/reviews`, { language: 'en-US', page: 1 }, TTL.season);
  return (d.results ?? []).slice(0, max).map((r: any): TmdbReview => ({
    id: String(r.id ?? ''),
    author: r.author_details?.name || r.author_details?.username || r.author || 'TMDB user',
    rating: typeof r.author_details?.rating === 'number' ? r.author_details.rating : undefined,
    content: String(r.content ?? '').trim(),
    createdAt: r.created_at,
    url: r.url
  })).filter((r: TmdbReview) => r.content.length > 0);
}

export interface WatchProviderOption { id: number; name: string; logoPath: string | null }
export async function listWatchProviders(region = 'US'): Promise<WatchProviderOption[]> {
  const d = await cachedJson<any>('/watch/providers/movie', { watch_region: region }, TTL.providers);
  return (d.results ?? [])
    .map((p: any) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null }))
    .sort((a: WatchProviderOption, b: WatchProviderOption) => a.name.localeCompare(b.name));
}

// Candidate keys for recommendations: similar + recommendations of a title
export async function candidateKeysFor(seedKeys: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const k of seedKeys) {
    const meta = await db.titles.get(k);
    if (meta) out.push(...meta.recommendations, ...meta.similar);
  }
  return out;
}
