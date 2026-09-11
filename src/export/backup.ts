import { db } from '../storage/db';
import { BACKUP_VERSION, defaultSettings, type BackupFile } from '../data/types';
import { APP_VERSION } from '../data/config';
import { getSettings } from '../storage/repo';

export async function createBackup(): Promise<BackupFile> {
  const [settings, library, progress, diary, lists, listItems, pairwise, recFeedback, titles] = await Promise.all([
    getSettings(), db.library.toArray(), db.progress.toArray(), db.diary.toArray(),
    db.lists.toArray(), db.listItems.toArray(), db.pairwise.toArray(), db.recFeedback.toArray(),
    db.titles.toArray()
  ]);
  return {
    format: 'SLATE_BACKUP',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: { settings, library, progress, diary, lists, listItems, pairwise, recFeedback, titles: titles.filter((t) => t.detailLevel === 'full') }
  };
}

export function backupFilename(): string {
  return `slate-backup-${new Date().toISOString().slice(0, 10)}.slate-backup.json`;
}

export interface BackupInspection { ok: boolean; error?: string; backup?: BackupFile; counts?: { titles: number; ratings: number; watched: number; lists: number; diary: number }; date?: string }

export function inspectBackup(raw: unknown): BackupInspection {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Not a valid JSON object' };
  const b = raw as Partial<BackupFile>;
  if (b.format !== 'SLATE_BACKUP') return { ok: false, error: 'This file is not a Slate backup' };
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return { ok: false, error: `Backup version ${b.version} is newer than this app supports` };
  const d = b.data;
  if (!d || !Array.isArray(d.library) || !Array.isArray(d.titles)) return { ok: false, error: 'Backup contents are missing or malformed' };
  const backup = b as BackupFile;
  return {
    ok: true,
    backup,
    date: backup.exportedAt,
    counts: {
      titles: d.library.length,
      ratings: d.library.filter((e) => e.rating !== undefined).length,
      watched: d.library.filter((e) => e.status === 'watched').length,
      lists: d.lists?.length ?? 0,
      diary: d.diary?.length ?? 0
    }
  };
}

export type RestoreMode = 'merge' | 'replace';

export async function restoreBackup(backup: BackupFile, mode: RestoreMode): Promise<void> {
  const d = backup.data;
  await db.transaction('rw', [db.settings, db.library, db.progress, db.diary, db.lists, db.listItems, db.pairwise, db.recFeedback, db.titles], async () => {
    if (mode === 'replace') {
      await Promise.all([db.library.clear(), db.progress.clear(), db.diary.clear(), db.lists.clear(), db.listItems.clear(), db.pairwise.clear(), db.recFeedback.clear()]);
    }
    const settings = { ...defaultSettings(), ...d.settings, id: 'settings' as const };
    if (mode === 'replace') await db.settings.put(settings);
    for (const e of d.library) {
      if (mode === 'merge') {
        const existing = await db.library.get(e.key);
        if (existing && existing.updatedAt > e.updatedAt) continue;
      }
      await db.library.put(e);
    }
    for (const p of d.progress ?? []) {
      if (mode === 'merge') {
        const existing = await db.progress.get(p.key);
        if (existing) p.episodes = { ...p.episodes, ...existing.episodes };
      }
      await db.progress.put(p);
    }
    if (mode === 'replace') {
      await db.diary.bulkAdd((d.diary ?? []).map(({ id, ...rest }) => rest as any));
      await db.pairwise.bulkAdd((d.pairwise ?? []).map(({ id, ...rest }) => rest as any));
      await db.recFeedback.bulkAdd((d.recFeedback ?? []).map(({ id, ...rest }) => rest as any));
      await db.lists.bulkAdd(d.lists ?? []);
      await db.listItems.bulkPut(d.listItems ?? []);
    } else {
      // merge: diary entries dedupe by key+date+episode
      for (const entry of d.diary ?? []) {
        const dupe = await db.diary.where('key').equals(entry.key).filter((x) => x.date === entry.date && x.season === entry.season && x.episode === entry.episode).first();
        if (!dupe) await db.diary.add({ ...entry, id: undefined });
      }
      for (const list of d.lists ?? []) {
        const existing = await db.lists.where('name').equals(list.name).first();
        if (!existing) await db.lists.add({ ...list, id: undefined });
      }
    }
    // restore cached metadata so the library renders fully offline
    for (const t of d.titles ?? []) {
      const existing = await db.titles.get(t.key);
      if (!existing || existing.detailLevel === 'summary') await db.titles.put(t);
    }
  });
}

export async function wipeAll() {
  await db.transaction('rw', [db.settings, db.library, db.progress, db.diary, db.lists, db.listItems, db.pairwise, db.recFeedback, db.titles, db.metaCache], async () => {
    await Promise.all([db.settings.clear(), db.library.clear(), db.progress.clear(), db.diary.clear(), db.lists.clear(), db.listItems.clear(), db.pairwise.clear(), db.recFeedback.clear(), db.titles.clear(), db.metaCache.clear()]);
  });
}
