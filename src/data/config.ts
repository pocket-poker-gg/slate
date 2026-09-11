// TMDB is a public entertainment-metadata API. This key identifies this app's
// client-side reads only; no personal data is ever sent to TMDB (see docs/PRIVACY.md).
// The key is a free developer key and is intentionally shipped client-side, as
// TMDB's API is designed for direct client access.
export const TMDB_API_KEY = '05f9ba4aac6d4a5b2084144087dea224';
export const TMDB_API_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p';
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'Slate';

export const posterUrl = (path: string | null | undefined, size: 'w92' | 'w154' | 'w185' | 'w342' | 'w500' = 'w342') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const backdropUrl = (path: string | null | undefined, size: 'w780' | 'w1280' = 'w1280') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const logoUrl = (path: string | null | undefined, size: 'w45' | 'w92' | 'w185' = 'w92') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
export const profileUrl = (path: string | null | undefined, size: 'w185' | 'w342' = 'w185') =>
  path ? `${TMDB_IMG}/${size}${path}` : null;
