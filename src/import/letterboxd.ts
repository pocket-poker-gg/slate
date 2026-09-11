// Letterboxd export import: ratings.csv, watched.csv, diary.csv, reviews.csv, watchlist.csv, lists/*.csv
// Everything parses locally in the browser; files never leave the device.
import { searchMulti } from '../providers/tmdb';
import { getEntry, updateEntry, addDiary } from '../storage/repo';
import { db } from '../storage/db';
import type { MediaType } from '../data/types';

export interface ParsedRow { title: string; year?: number; rating?: number; date?: string; review?: string; rewatch?: boolean; tags?: string[]; letterboxdUri?: string }
export interface ImportPlan {
  kind: 'ratings' | 'watched' | 'diary' | 'reviews' | 'watchlist' | 'likes';
  rows: ParsedRow[];
}
export interface MatchResult {
  row: ParsedRow;
  status: 'matched' | 'ambiguous' | 'unmatched';
  key?: string; // movie:<id>
  matchedTitle?: string; matchedYear?: number;
  candidates?: { key: string; title: string; year?: number }[];
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cur.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.length > 1 || cur[0] !== '') rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function detectKind(filename: string): ImportPlan['kind'] | null {
  const f = filename.toLowerCase();
  if (f.includes('ratings')) return 'ratings';
  if (f.includes('diary')) return 'diary';
  if (f.includes('reviews')) return 'reviews';
  if (f.includes('watchlist')) return 'watchlist';
  if (f.includes('watched')) return 'watched';
  if (f.includes('likes')) return 'likes';
  return null;
}

export function parseLetterboxdCSV(filename: string, text: string): ImportPlan | null {
  const kind = detectKind(filename);
  if (!kind) return null;
  const rows = parseCSV(text);
  if (rows.length < 2) return { kind, rows: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: ParsedRow[] = [];
  for (const r of rows.slice(1)) {
    const get = (name: string) => { const i = idx(name); return i >= 0 ? r[i]?.trim() : undefined; };
    const title = get('name') ?? get('title');
    if (!title) continue;
    const yearRaw = get('year');
    const ratingRaw = get('rating');
    out.push({
      title,
      year: yearRaw ? Number(yearRaw) : undefined,
      rating: ratingRaw ? Number(ratingRaw) : undefined,
      date: get('date') ?? get('watched date'),
      review: get('review'),
      rewatch: (get('rewatch') ?? '').toLowerCase() === 'yes',
      tags: get('tags') ? get('tags')!.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      letterboxdUri: get('letterboxd uri') ?? get('letterboxd_uri')
    });
  }
  return { kind, rows: out };
}

export async function matchRow(row: ParsedRow): Promise<MatchResult> {
  try {
    const res = await searchMulti(row.title);
    const movies = res.items.filter((i) => i.mediaType === 'movie');
    if (!movies.length) return { row, status: 'unmatched' };
    const exact = movies.filter((m) => m.title.toLowerCase() === row.title.toLowerCase());
    const pool = exact.length ? exact : movies;
    if (row.year) {
      const yearMatches = pool.filter((m) => m.year === row.year);
      if (yearMatches.length === 1) return { row, status: 'matched', key: yearMatches[0].key, matchedTitle: yearMatches[0].title, matchedYear: yearMatches[0].year };
      if (yearMatches.length > 1) return { row, status: 'ambiguous', candidates: yearMatches.slice(0, 5).map((m) => ({ key: m.key, title: m.title, year: m.year })) };
    }
    if (pool.length === 1) return { row, status: 'matched', key: pool[0].key, matchedTitle: pool[0].title, matchedYear: pool[0].year };
    const top = pool[0];
    if (top.title.toLowerCase() === row.title.toLowerCase() && (!row.year || !top.year || Math.abs((top.year ?? 0) - row.year) <= 1)) {
      return { row, status: 'matched', key: top.key, matchedTitle: top.title, matchedYear: top.year };
    }
    return { row, status: 'ambiguous', candidates: pool.slice(0, 5).map((m) => ({ key: m.key, title: m.title, year: m.year })) };
  } catch {
    return { row, status: 'unmatched' };
  }
}

export async function applyMatch(plan: ImportPlan, match: MatchResult): Promise<void> {
  const key = match.key;
  if (!key) return;
  const [, idStr] = key.split(':');
  const mediaType: MediaType = 'movie';
  void idStr;
  const cur = await getEntry(key);
  switch (plan.kind) {
    case 'ratings':
      if (match.row.rating) await updateEntry(key, { rating: match.row.rating, status: cur.status ?? 'watched', lastWatchedAt: cur.lastWatchedAt ?? Date.now(), watchCount: Math.max(1, cur.watchCount) });
      break;
    case 'watched':
    case 'likes':
      await updateEntry(key, { status: 'watched', favorite: plan.kind === 'likes' ? true : cur.favorite, lastWatchedAt: cur.lastWatchedAt ?? Date.now(), watchCount: Math.max(1, cur.watchCount) });
      break;
    case 'watchlist':
      await updateEntry(key, { status: cur.status === 'watched' ? 'watched' : 'watchlist' });
      break;
    case 'diary':
      await updateEntry(key, { status: 'watched', lastWatchedAt: Date.now(), watchCount: Math.max(1, cur.watchCount) });
      await addDiary({ key, mediaType, date: match.row.date ?? new Date().toISOString().slice(0, 10), rating: match.row.rating, review: match.row.review, rewatch: match.row.rewatch ?? false });
      break;
    case 'reviews':
      await updateEntry(key, { review: match.row.review ?? cur.review, rating: match.row.rating ?? cur.rating, reviewUpdatedAt: Date.now() });
      break;
  }
}

export async function recordImport(source: string, matched: number, unmatched: number, summary: string) {
  await db.imports.add({ source, at: Date.now(), matched, unmatched, summary });
}
