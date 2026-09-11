// Deep category browsing: genre hubs with real subgenres. Every subgenre is a
// genuine catalog cut - a TMDB genre/keyword combination with keyword IDs
// verified against the live TMDB API - not a reshuffled label on one list.
import type { MediaType, TitleMeta } from './types';
import { discover, type SearchResultItem, type DiscoverParams } from '../providers/tmdb';

export interface Subgenre {
  id: string;
  name: string;
  // Extra genre ids ANDed with the hub genre.
  genres?: number[];
  // TMDB keyword ids ANDed into the discover request (live-API-verified).
  keywords?: number[];
  // Optional request tweaks (e.g. runtime bounds for slow-burn cuts).
  params?: Partial<Pick<DiscoverParams, 'voteGte' | 'voteCountGte' | 'runtimeLte' | 'runtimeGte'>>;
}

export interface CategoryHub {
  id: string;
  name: string;
  genreId: number;
  subgenres: Subgenre[];
}

const kw = (id: string, name: string, keywords: number[], genres?: number[]): Subgenre => ({ id, name, keywords, genres });
const gx = (id: string, name: string, genres: number[]): Subgenre => ({ id, name, genres });

// Movie keyword ids verified against /search/keyword + /keyword/{id} on 2026-09-11.
const MOVIE_HORROR: Subgenre[] = [
  kw('psychological', 'Psychological', [295907]),
  kw('supernatural', 'Supernatural', [6152]),
  kw('slasher', 'Slasher', [12339]),
  kw('found-footage', 'Found Footage', [163053]),
  kw('body-horror', 'Body Horror', [283085]),
  kw('folk', 'Folk Horror', [209568]),
  kw('gothic', 'Gothic', [33505]),
  kw('ghost', 'Ghost Stories', [162846]),
  kw('cosmic', 'Cosmic Horror', [215959]),
  kw('zombie', 'Zombie', [12377]),
  kw('vampire', 'Vampire', [3133]),
  kw('home-invasion', 'Home Invasion', [14903])
];
const MOVIE_SCIFI: Subgenre[] = [
  kw('space', 'Space', [9882]),
  kw('time-travel', 'Time Travel', [4379]),
  kw('dystopia', 'Dystopia', [4565]),
  kw('cyberpunk', 'Cyberpunk', [12190]),
  kw('alien-invasion', 'Alien Invasion', [14909]),
  kw('ai', 'Artificial Intelligence', [378084]),
  kw('post-apocalyptic', 'Post-Apocalyptic', [359337]),
  kw('space-opera', 'Space Opera', [161176]),
  kw('time-loop', 'Time Loop', [10854]),
  kw('robots', 'Robots & AI', [14544])
];
const MOVIE_COMEDY: Subgenre[] = [
  kw('dark', 'Dark Comedy', [10123]),
  gx('romcom', 'Romantic Comedy', [10749]),
  kw('satire', 'Satire', [8201]),
  kw('parody', 'Parody & Spoof', [9755]),
  kw('slapstick', 'Slapstick', [9253]),
  kw('buddy', 'Buddy Comedy', [15214]),
  kw('mockumentary', 'Mockumentary', [11800])
];
const MOVIE_CRIME: Subgenre[] = [
  kw('heist', 'Heist', [10051]),
  kw('detective', 'Detective', [703]),
  kw('true-crime', 'True Crime', [33722]),
  kw('gangster', 'Gangster & Mob', [3149]),
  kw('noir', 'Neo-Noir', [207268]),
  kw('serial-killer', 'Serial Killer', [10714])
];
const MOVIE_THRILLER: Subgenre[] = [
  kw('psychological', 'Psychological', [12565]),
  kw('spy', 'Spy & Espionage', [470, 5265]),
  kw('conspiracy', 'Conspiracy', [10410]),
  kw('kidnapping', 'Kidnapping', [1930]),
  kw('revenge', 'Revenge', [9748]),
  kw('survival', 'Survival', [10349])
];
const MOVIE_ACTION: Subgenre[] = [
  kw('martial-arts', 'Martial Arts', [779]),
  kw('superhero', 'Superhero', [9715]),
  kw('disaster', 'Disaster', [10617]),
  kw('revenge', 'Revenge', [9748]),
  gx('war', 'War', [10752]),
  kw('heist', 'Heist', [10051])
];
const MOVIE_ADVENTURE: Subgenre[] = [
  kw('treasure', 'Treasure Hunt', [6956]),
  kw('survival', 'Survival', [10349]),
  kw('swashbuckler', 'Swashbuckler', [157186]),
  gx('fantasy', 'Fantasy Adventure', [14]),
  kw('kaiju', 'Kaiju & Giant Monsters', [161791])
];
const MOVIE_FANTASY: Subgenre[] = [
  kw('high-fantasy', 'High Fantasy', [211227]),
  kw('dark', 'Dark Fantasy', [177895]),
  kw('fairy-tale', 'Fairy Tale', [3205]),
  kw('supernatural', 'Supernatural', [6152])
];
const MOVIE_ANIMATION: Subgenre[] = [
  kw('anime', 'Anime', [210024]),
  kw('adult', 'Adult Animation', [161919]),
  kw('fairy-tale', 'Fairy Tale', [3205]),
  gx('family', 'Family Animation', [10751])
];
const MOVIE_DRAMA: Subgenre[] = [
  kw('coming-of-age', 'Coming of Age', [10683]),
  kw('courtroom', 'Courtroom & Legal', [33519, 222517]),
  kw('biopic', 'Biopic', [360939]),
  kw('period', 'Period Drama', [15060]),
  kw('political', 'Political', [298528]),
  kw('sports', 'Sports Drama', [294708]),
  kw('historical', 'Historical', [192772]),
  kw('war', 'War Drama', [324284])
];
const MOVIE_MYSTERY: Subgenre[] = [
  kw('whodunit', 'Whodunit', [12570]),
  kw('detective', 'Detective', [703]),
  kw('noir', 'Neo-Noir', [207268]),
  kw('conspiracy', 'Conspiracy', [10410])
];
const MOVIE_ROMANCE: Subgenre[] = [
  gx('romcom', 'Romantic Comedy', [35]),
  kw('period', 'Period Romance', [15060]),
  kw('teen', 'Teen Romance', [368947]),
  kw('love-story', 'Love Story', [244886])
];
const MOVIE_DOCUMENTARY: Subgenre[] = [
  kw('true-crime', 'True Crime', [33722]),
  kw('nature', 'Nature', [221355]),
  kw('music', 'Music', [283297]),
  kw('mockumentary', 'Mockumentary', [11800])
];

export const MOVIE_HUBS: CategoryHub[] = [
  { id: 'horror', name: 'Horror', genreId: 27, subgenres: MOVIE_HORROR },
  { id: 'sci-fi', name: 'Sci-Fi', genreId: 878, subgenres: MOVIE_SCIFI },
  { id: 'comedy', name: 'Comedy', genreId: 35, subgenres: MOVIE_COMEDY },
  { id: 'thriller', name: 'Thriller', genreId: 53, subgenres: MOVIE_THRILLER },
  { id: 'crime', name: 'Crime', genreId: 80, subgenres: MOVIE_CRIME },
  { id: 'drama', name: 'Drama', genreId: 18, subgenres: MOVIE_DRAMA },
  { id: 'action', name: 'Action', genreId: 28, subgenres: MOVIE_ACTION },
  { id: 'adventure', name: 'Adventure', genreId: 12, subgenres: MOVIE_ADVENTURE },
  { id: 'fantasy', name: 'Fantasy', genreId: 14, subgenres: MOVIE_FANTASY },
  { id: 'animation', name: 'Animation', genreId: 16, subgenres: MOVIE_ANIMATION },
  { id: 'mystery', name: 'Mystery', genreId: 9648, subgenres: MOVIE_MYSTERY },
  { id: 'romance', name: 'Romance', genreId: 10749, subgenres: MOVIE_ROMANCE },
  { id: 'documentary', name: 'Documentary', genreId: 99, subgenres: MOVIE_DOCUMENTARY },
  { id: 'family', name: 'Family', genreId: 10751, subgenres: [] },
  { id: 'war', name: 'War', genreId: 10752, subgenres: [] },
  { id: 'western', name: 'Western', genreId: 37, subgenres: [] },
  { id: 'history', name: 'History', genreId: 36, subgenres: [] }
];

// TV subgenres (same verification pass; genre ids differ on the TV side).
const TV_DRAMA: Subgenre[] = [
  kw('medical', 'Medical', [208788]),
  kw('legal', 'Legal & Courtroom', [222517]),
  kw('political', 'Political', [298528]),
  kw('period', 'Period Drama', [15060]),
  kw('anthology', 'Anthology', [9706]),
  kw('coming-of-age', 'Coming of Age', [10683])
];
const TV_COMEDY: Subgenre[] = [
  kw('sitcom', 'Sitcom', [193171]),
  kw('mockumentary', 'Mockumentary', [11800]),
  kw('dark', 'Dark Comedy', [10123]),
  kw('sketch', 'Sketch Comedy', [156203])
];
const TV_CRIME: Subgenre[] = [
  kw('true-crime', 'True Crime', [33722]),
  kw('procedural', 'Police Procedural', [268067]),
  kw('detective', 'Detective', [703]),
  kw('gangster', 'Gangster & Mob', [3149]),
  kw('heist', 'Heist', [10051])
];
const TV_MYSTERY: Subgenre[] = [
  kw('whodunit', 'Whodunit', [12570]),
  kw('noir', 'Neo-Noir', [207268]),
  kw('supernatural', 'Supernatural', [6152]),
  kw('detective', 'Detective', [703])
];
const TV_SCIFI: Subgenre[] = [
  kw('dystopia', 'Dystopia', [4565]),
  kw('time-travel', 'Time Travel', [4379]),
  kw('space', 'Space', [9882, 3801]),
  kw('supernatural', 'Supernatural', [6152]),
  kw('ai', 'Artificial Intelligence', [378084]),
  kw('post-apocalyptic', 'Post-Apocalyptic', [359337])
];
const TV_ACTION: Subgenre[] = [
  kw('superhero', 'Superhero', [9715]),
  kw('martial-arts', 'Martial Arts', [779]),
  kw('spy', 'Spy & Espionage', [470, 5265])
];
const TV_ANIMATION: Subgenre[] = [
  kw('anime', 'Anime', [210024]),
  kw('adult', 'Adult Animation', [161919]),
  gx('kids', 'Kids Animation', [10762])
];
const TV_DOCUMENTARY: Subgenre[] = [
  kw('true-crime', 'True Crime', [33722]),
  kw('nature', 'Nature', [221355]),
  kw('music', 'Music', [283297]),
  kw('history', 'History', [192772])
];
const TV_REALITY: Subgenre[] = [
  kw('competition', 'Competition', [271]),
  kw('cooking', 'Cooking', [1918]),
  kw('dating', 'Dating', [215119])
];

export const TV_HUBS: CategoryHub[] = [
  { id: 'drama', name: 'Drama', genreId: 18, subgenres: TV_DRAMA },
  { id: 'comedy', name: 'Comedy', genreId: 35, subgenres: TV_COMEDY },
  { id: 'crime', name: 'Crime', genreId: 80, subgenres: TV_CRIME },
  { id: 'mystery', name: 'Mystery', genreId: 9648, subgenres: TV_MYSTERY },
  { id: 'sci-fi-fantasy', name: 'Sci-Fi & Fantasy', genreId: 10765, subgenres: TV_SCIFI },
  { id: 'action-adventure', name: 'Action & Adventure', genreId: 10759, subgenres: TV_ACTION },
  { id: 'animation', name: 'Animation', genreId: 16, subgenres: TV_ANIMATION },
  { id: 'documentary', name: 'Documentary', genreId: 99, subgenres: TV_DOCUMENTARY },
  { id: 'reality', name: 'Reality', genreId: 10764, subgenres: TV_REALITY },
  { id: 'family', name: 'Family', genreId: 10751, subgenres: [] },
  { id: 'kids', name: 'Kids', genreId: 10762, subgenres: [] },
  { id: 'war-politics', name: 'War & Politics', genreId: 10768, subgenres: [] }
];

export const hubsFor = (mediaType: MediaType): CategoryHub[] => (mediaType === 'movie' ? MOVIE_HUBS : TV_HUBS);
export const findHub = (mediaType: MediaType, hubId: string): CategoryHub | undefined =>
  hubsFor(mediaType).find((h) => h.id === hubId);

// Compose the discover request for a hub / subgenre cut. Keywords AND onto the
// hub genre; extra genres AND as well, so "Romantic Comedy" inside Comedy is
// genuinely comedy + romance, not a relabeled popular list.
export function categoryQuery(mediaType: MediaType, hub: CategoryHub, sub: Subgenre | undefined, page: number): DiscoverParams {
  const genres = [hub.genreId, ...(sub?.genres ?? [])];
  return {
    mediaType,
    page,
    genres,
    keywords: sub?.keywords,
    sort: 'popularity.desc',
    voteCountGte: sub ? 40 : 100,
    ...sub?.params
  };
}

// Integrity checks used by tests: every subgenre id unique within its hub,
// keyword ids positive integers, hub ids unique per media type.
export function validateCategories(): string[] {
  const problems: string[] = [];
  for (const mt of ['movie', 'tv'] as const) {
    const hubs = hubsFor(mt);
    const hubIds = new Set<string>();
    for (const h of hubs) {
      if (hubIds.has(h.id)) problems.push(`${mt}: duplicate hub ${h.id}`);
      hubIds.add(h.id);
      const subIds = new Set<string>();
      for (const s of h.subgenres) {
        if (subIds.has(s.id)) problems.push(`${mt}/${h.id}: duplicate subgenre ${s.id}`);
        subIds.add(s.id);
        for (const k of s.keywords ?? []) {
          if (!Number.isInteger(k) || k <= 0) problems.push(`${mt}/${h.id}/${s.id}: invalid keyword id ${k}`);
        }
        for (const g of s.genres ?? []) {
          if (g === h.genreId) problems.push(`${mt}/${h.id}/${s.id}: redundant genre id ${g}`);
        }
      }
    }
  }
  return problems;
}

// Tile artwork: the backdrop of the most popular title in the hub, cached via
// the discover() layer (IndexedDB + service worker), so rails render instantly
// on revisit and cost one request per hub per 12h at most.
const tileMem = new Map<string, string | null>();
export async function hubTileBackdrop(mediaType: MediaType, hub: CategoryHub): Promise<string | null> {
  const cacheId = `${mediaType}:${hub.id}`;
  if (tileMem.has(cacheId)) return tileMem.get(cacheId) ?? null;
  try {
    const res = await discover({ mediaType, genres: [hub.genreId], sort: 'popularity.desc', voteCountGte: 500, page: 1 });
    const pick: SearchResultItem | undefined = res.items.find((i) => i.backdropPath || i.posterPath);
    const path = pick?.backdropPath ?? pick?.posterPath ?? null;
    tileMem.set(cacheId, path);
    return path;
  } catch {
    tileMem.set(cacheId, null);
    return null;
  }
}

// re-export to keep imports tidy for screens
export type { TitleMeta };
