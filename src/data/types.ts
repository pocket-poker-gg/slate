export type MediaType = 'movie' | 'tv';

export const titleKey = (mediaType: MediaType, tmdbId: number) => `${mediaType}:${tmdbId}`;
export const parseKey = (key: string): { mediaType: MediaType; tmdbId: number } => {
  const [m, id] = key.split(':');
  return { mediaType: m as MediaType, tmdbId: Number(id) };
};

export interface CastMember { id: number; name: string; character?: string; order: number; profilePath?: string | null }
export interface CrewMember { id: number; name: string; job: string }
export interface SeasonSummary { seasonNumber: number; name: string; episodeCount: number; airDate?: string; posterPath?: string | null }
export interface WatchProviderInfo { id: number; name: string; logoPath: string | null }
export interface ProviderBlock { link?: string; flatrate?: WatchProviderInfo[]; rent?: WatchProviderInfo[]; buy?: WatchProviderInfo[]; region: string }

export interface TitleMeta {
  key: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: number;
  releaseDate?: string;
  overview?: string;
  tagline?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  genres: number[];
  genreNames: string[];
  keywords: string[];
  cast: CastMember[];
  crew: CrewMember[];
  voteAverage?: number;
  voteCount?: number;
  popularity?: number;
  runtime?: number;
  episodeRuntimes: number[];
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
  status?: string;
  networks: string[];
  companies: string[];
  originalLanguage?: string;
  originCountry: string[];
  certification?: string;
  seasons: SeasonSummary[];
  trailerKey?: string;
  providers?: ProviderBlock;
  imdbId?: string;
  recommendations: string[]; // keys
  similar: string[]; // keys
  fetchedAt: number;
  detailLevel: 'summary' | 'full';
}

export type LibraryStatus = 'watchlist' | 'watching' | 'watched' | 'paused' | 'dropped';

export interface LibraryEntry {
  key: string;
  status?: LibraryStatus;
  favorite: boolean;
  rating?: number; // 0.5..5
  review?: string;
  reviewSpoiler: boolean;
  reviewUpdatedAt?: number;
  notes?: string;
  tags: string[];
  priority: number; // 0 normal, 1 high, 2 top
  watchSoon: boolean;
  addedAt: number;
  updatedAt: number;
  firstWatchedAt?: number;
  lastWatchedAt?: number;
  watchCount: number;
  notInterested: boolean;
  skipCount: number;
  dismissedCount: number;
}

export interface EpisodeMark { watchedAt: number; rating?: number }
export interface ProgressEntry {
  key: string; // tv:<id>
  episodes: Record<string, EpisodeMark>; // "S:E"
  updatedAt: number;
}

export interface DiaryEntry {
  id?: number;
  key: string;
  mediaType: MediaType;
  date: string; // YYYY-MM-DD
  season?: number;
  episode?: number;
  rating?: number;
  review?: string;
  rewatch: boolean;
  createdAt: number;
}

export interface ListDef { id?: number; name: string; notes?: string; coverKey?: string; createdAt: number; updatedAt: number }
export interface ListItem { listId: number; key: string; order: number; note?: string; addedAt: number }

export interface PairwiseChoice { id?: number; aKey: string; bKey: string; winner: 'a' | 'b'; at: number }

export type RecFeedbackKind = 'dismiss' | 'more' | 'less' | 'skip' | 'picked' | 'not_interested';
export interface RecFeedback { id?: number; key: string; kind: RecFeedbackKind; at: number; context?: string }

export interface SliderSet {
  comfortingDark: number; // 0 comforting .. 1 dark
  easyCerebral: number;
  fastSlow: number;
  realisticFantastical: number;
  mainstreamObscure: number;
}

export interface DiscoveryDials {
  familiarAdventurous: number;
  popularHidden: number;
  easyCerebral: number;
  lightDark: number;
  immediateSlowburn: number;
}

export interface Settings {
  id: 'settings';
  theme: 'system' | 'dark' | 'light';
  region: string;
  watchProviders: number[]; // TMDB provider ids
  sliders: SliderSet;
  dials: DiscoveryDials;
  backupReminder: 'monthly' | 'changes' | 'never';
  changesSinceBackup: number;
  lastBackupAt?: number;
  onboarded: boolean;
  seenVersion?: string;
  searchHistory: string[];
}

export interface MetaCacheRow { url: string; data: unknown; fetchedAt: number; expiresAt: number }

export interface ImportRecord { id?: number; source: string; at: number; matched: number; unmatched: number; summary: string }

export const DEFAULT_SLIDERS: SliderSet = { comfortingDark: 0.5, easyCerebral: 0.5, fastSlow: 0.5, realisticFantastical: 0.5, mainstreamObscure: 0.5 };
export const DEFAULT_DIALS: DiscoveryDials = { familiarAdventurous: 0.35, popularHidden: 0.3, easyCerebral: 0.5, lightDark: 0.5, immediateSlowburn: 0.5 };

export const defaultSettings = (): Settings => ({
  id: 'settings',
  theme: 'system',
  region: 'US',
  watchProviders: [],
  sliders: { ...DEFAULT_SLIDERS },
  dials: { ...DEFAULT_DIALS },
  backupReminder: 'changes',
  changesSinceBackup: 0,
  onboarded: false,
  searchHistory: []
});

// --- External ratings ---
export interface ExternalRating {
  source: string; // 'tmdb' | 'imdb' | 'rottentomatoes' | 'letterboxd'
  label: string;
  value?: number; // normalized 0..100 audience-ish scale when known
  rawLabel?: string; // e.g. "7.8/10", "92%"
  voteCount?: number;
  kind: 'critic' | 'audience' | 'aggregate';
  url?: string;
  available: boolean;
  unavailableReason?: string;
}

export interface BackupFile {
  format: 'SLATE_BACKUP';
  version: number;
  exportedAt: string;
  appVersion: string;
  data: {
    settings: Settings;
    library: LibraryEntry[];
    progress: ProgressEntry[];
    diary: DiaryEntry[];
    lists: ListDef[];
    listItems: ListItem[];
    pairwise: PairwiseChoice[];
    recFeedback: RecFeedback[];
    titles: TitleMeta[]; // cached metadata so restore keeps offline richness
  };
}
export const BACKUP_VERSION = 1;
