import { db } from './db';
import { defaultSettings, type DiaryEntry, type LibraryEntry, type LibraryStatus, type ListDef, type ProgressEntry, type RecFeedbackKind, type Settings } from '../data/types';

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  const d = defaultSettings();
  if (s) return { ...d, ...s, sliders: { ...d.sliders, ...s.sliders }, dials: { ...d.dials, ...s.dials } };
  // Read-only: never create the row here. A put inside a liveQuery read
  // transaction throws ReadOnlyError and crashes the app on fresh installs.
  // saveSettings persists the row on the first real change.
  return d;
}
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch, id: 'settings' as const };
  await db.settings.put(next);
  return next;
}

export async function getEntry(key: string): Promise<LibraryEntry> {
  const e = await db.library.get(key);
  if (e) return e;
  return { key, favorite: false, reviewSpoiler: false, tags: [], priority: 0, watchSoon: false, addedAt: Date.now(), updatedAt: Date.now(), watchCount: 0, notInterested: false, skipCount: 0, dismissedCount: 0 };
}

export async function updateEntry(key: string, patch: Partial<LibraryEntry>): Promise<LibraryEntry> {
  const cur = await getEntry(key);
  const next = { ...cur, ...patch, key, updatedAt: Date.now() };
  await db.library.put(next);
  void bumpChanges();
  return next;
}

async function bumpChanges() {
  try {
    const s = await getSettings();
    await db.settings.put({ ...s, changesSinceBackup: s.changesSinceBackup + 1 });
  } catch { /* non-fatal */ }
}

export async function setStatus(key: string, status: LibraryStatus | undefined) {
  const patch: Partial<LibraryEntry> = { status };
  if (status === 'watched') {
    const cur = await getEntry(key);
    patch.lastWatchedAt = Date.now();
    patch.firstWatchedAt = cur.firstWatchedAt ?? Date.now();
    patch.watchCount = Math.max(1, cur.watchCount);
  }
  return updateEntry(key, patch);
}

export async function setRating(key: string, rating: number | undefined) {
  return updateEntry(key, { rating });
}

export async function toggleFavorite(key: string) {
  const cur = await getEntry(key);
  return updateEntry(key, { favorite: !cur.favorite });
}

export async function removeEntry(key: string) {
  await db.library.delete(key);
  void bumpChanges();
}

// --- TV progress ---
export const epId = (s: number, e: number) => `${s}:${e}`;

export async function getProgress(key: string): Promise<ProgressEntry> {
  return (await db.progress.get(key)) ?? { key, episodes: {}, updatedAt: Date.now() };
}

export async function markEpisode(key: string, season: number, episode: number, watched: boolean, rating?: number) {
  const p = await getProgress(key);
  const episodes = { ...p.episodes };
  if (watched) episodes[epId(season, episode)] = { watchedAt: Date.now(), rating };
  else delete episodes[epId(season, episode)];
  await db.progress.put({ ...p, episodes, updatedAt: Date.now() });
  void bumpChanges();
}

export async function markSeason(key: string, season: number, episodeCount: number, watched: boolean) {
  const p = await getProgress(key);
  const episodes = { ...p.episodes };
  for (let e = 1; e <= episodeCount; e++) {
    if (watched) episodes[epId(season, e)] = episodes[epId(season, e)] ?? { watchedAt: Date.now() };
    else delete episodes[epId(season, e)];
  }
  await db.progress.put({ ...p, episodes, updatedAt: Date.now() });
  void bumpChanges();
}

export function nextEpisode(p: ProgressEntry, seasons: { seasonNumber: number; episodeCount: number }[]): { season: number; episode: number } | null {
  for (const s of [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)) {
    for (let e = 1; e <= s.episodeCount; e++) {
      if (!p.episodes[epId(s.seasonNumber, e)]) return { season: s.seasonNumber, episode: e };
    }
  }
  return null;
}

export function progressStats(p: ProgressEntry, totalEpisodes: number | undefined, episodeRuntime: number | undefined) {
  const watched = Object.keys(p.episodes).length;
  const remaining = totalEpisodes !== undefined ? Math.max(0, totalEpisodes - watched) : undefined;
  const remainingMinutes = remaining !== undefined && episodeRuntime ? remaining * episodeRuntime : undefined;
  return { watched, remaining, remainingMinutes, pct: totalEpisodes ? watched / totalEpisodes : 0 };
}

// --- Diary ---
export async function addDiary(entry: Omit<DiaryEntry, 'id' | 'createdAt'>): Promise<number> {
  const id = (await db.diary.add({ ...entry, createdAt: Date.now() })) as number;
  void bumpChanges();
  return id;
}
export async function deleteDiary(id: number) { await db.diary.delete(id); void bumpChanges(); }

// --- Lists ---
export async function createList(name: string, notes?: string): Promise<number> {
  const id = (await db.lists.add({ name, notes, createdAt: Date.now(), updatedAt: Date.now() })) as number;
  void bumpChanges();
  return id;
}
export async function addToList(listId: number, key: string, note?: string) {
  const items = await db.listItems.where('listId').equals(listId).toArray();
  const order = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0;
  await db.listItems.put({ listId, key, order, note, addedAt: Date.now() });
  void bumpChanges();
}
export async function removeFromList(listId: number, key: string) {
  await db.listItems.delete([listId, key]);
  void bumpChanges();
}

// --- Feedback ---
export async function recordFeedback(key: string, kind: RecFeedbackKind, context?: string) {
  await db.recFeedback.add({ key, kind, at: Date.now(), context });
  if (kind === 'dismiss') { const e = await getEntry(key); await updateEntry(key, { dismissedCount: e.dismissedCount + 1 }); }
  if (kind === 'skip') { const e = await getEntry(key); await updateEntry(key, { skipCount: e.skipCount + 1 }); }
  if (kind === 'not_interested') await updateEntry(key, { notInterested: true, status: undefined, watchSoon: false });
}

// --- Search history ---
export async function pushSearchHistory(q: string) {
  const s = await getSettings();
  const history = [q, ...s.searchHistory.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 12);
  await db.settings.put({ ...s, searchHistory: history });
}

// --- Library queries ---
export async function libraryByStatus(status: LibraryStatus): Promise<LibraryEntry[]> {
  return db.library.where('status').equals(status).reverse().sortBy('updatedAt');
}
export async function allLibrary(): Promise<LibraryEntry[]> { return db.library.toArray(); }
export async function favorites(): Promise<LibraryEntry[]> { return db.library.where('favorite').equals(1 as any).toArray().catch(() => db.library.toArray().then((a) => a.filter((e) => e.favorite))); }
