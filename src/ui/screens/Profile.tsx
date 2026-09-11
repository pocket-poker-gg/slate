import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSettings, useOnline } from '../hooks';
import { saveSettings, getSettings } from '../../storage/repo';
import { createBackup, backupFilename, inspectBackup, restoreBackup, wipeAll, type BackupInspection } from '../../export/backup';
import { parseLetterboxdCSV, matchRow, applyMatch, recordImport, type ImportPlan, type MatchResult } from '../../import/letterboxd';
import { listWatchProviders, type WatchProviderOption } from '../../providers/tmdb';
import { db } from '../../storage/db';
import { logoUrl } from '../../data/config';
import { Segmented, Sheet, ConfirmSheet, useToast, LabeledSlider } from '../components';
import { APP_VERSION } from '../../data/config';
import { IconChevronR, IconShield, IconDownload, IconUpload, IconTrash } from '../icons';
import type { SliderSet } from '../../data/types';

function Row({ label, sub, to, onClick, danger }: { label: string; sub?: string; to?: string; onClick?: () => void; danger?: boolean }) {
  const inner = (
    <div className="cell" style={{ cursor: 'pointer' }}>
      <div className="cell-main">
        <div className="cell-title" style={danger ? { color: 'var(--destructive)' } : undefined}>{label}</div>
        {sub && <div className="cell-sub">{sub}</div>}
      </div>
      <IconChevronR />
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : <div onClick={onClick}>{inner}</div>;
}

export default function Profile() {
  const settings = useSettings();
  const toast = useToast();
  const online = useOnline();
  const [providersOpen, setProvidersOpen] = useState(false);
  const [providers, setProviders] = useState<WatchProviderOption[]>([]);
  const [slidersOpen, setSlidersOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [restore, setRestore] = useState<BackupInspection | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<{ plan: ImportPlan; matches: MatchResult[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    if (providersOpen && providers.length === 0) listWatchProviders('US').then((p) => setProviders(p.slice(0, 60))).catch(() => {});
  }, [providersOpen]);

  const estimate = async () => {
    try {
      const est = await navigator.storage.estimate();
      const mb = ((est.usage ?? 0) / 1048576).toFixed(1);
      setUsage(`${mb} MB`);
    } catch { setUsage('Unavailable'); }
  };

  const doBackup = async () => {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const file = new File([blob], backupFilename(), { type: 'application/json' });
    // Prefer iOS share sheet so the file lands in Files/iCloud Drive
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Slate backup' }); } catch { /* cancelled */ }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = backupFilename(); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    await saveSettings({ lastBackupAt: Date.now(), changesSinceBackup: 0 });
    toast('Backup exported');
  };

  const onRestoreFile = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text());
      const inspected = inspectBackup(parsed);
      if (!inspected.ok) { toast(inspected.error ?? 'Invalid backup'); return; }
      setRestore(inspected);
    } catch { toast('Could not read that file'); }
  };

  const onImportFiles = async (files: FileList) => {
    setImporting(true);
    let totalMatched = 0; let totalUnmatched = 0;
    for (const f of Array.from(files)) {
      const text = await f.text();
      const plan = parseLetterboxdCSV(f.name, text);
      if (!plan || plan.rows.length === 0) continue;
      const matches: MatchResult[] = [];
      for (const row of plan.rows.slice(0, 500)) {
        const m = await matchRow(row);
        matches.push(m);
        if (m.status === 'matched') { await applyMatch(plan, m); totalMatched++; }
        else totalUnmatched++;
      }
      setImportState({ plan, matches: matches.filter((m) => m.status !== 'matched') });
      await recordImport('letterboxd', totalMatched, totalUnmatched, `${f.name}: ${plan.rows.length} rows`);
    }
    setImporting(false);
    toast(`Import complete - ${totalMatched} matched, ${totalUnmatched} need review`);
  };

  const changes = settings?.changesSinceBackup ?? 0;
  const remindNeeded = settings && settings.backupReminder !== 'never' && (
    (settings.backupReminder === 'changes' && changes >= 25) ||
    (settings.backupReminder === 'monthly' && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > 30 * 86400000) && changes > 5)
  );

  return (
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div className="topbar"><div className="topbar-row"><div className="large-title">Profile</div></div></div>

      {remindNeeded && (
        <div style={{ padding: '0 16px' }}>
          <div className="card card-pad">
            <div className="headline">Back up your library</div>
            <div className="footnote mt8">You have made {changes} changes since your last backup. Everything lives only on this device - a backup keeps it safe.</div>
            <div className="row mt16" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={doBackup}><IconDownload /> Back up now</button>
              <button className="btn btn-ghost btn-sm" onClick={() => saveSettings({ backupReminder: 'never' })}>Don't remind me</button>
            </div>
          </div>
        </div>
      )}

      <div className="section" style={{ padding: '0 16px' }}>
        <div className="card">
          <div className="cell"><div className="cell-main"><div className="cell-title">Appearance</div></div></div>
          <div style={{ padding: '0 16px 14px' }}>
            <Segmented value={settings?.theme ?? 'system'} onChange={(v) => saveSettings({ theme: v as 'system' | 'dark' | 'light' })} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
          </div>
        </div>
        <div className="card mt16">
          <Row label="Streaming services" sub={`${settings?.watchProviders.length ?? 0} selected`} onClick={() => setProvidersOpen(true)} />
          <Row label="Taste sliders" onClick={() => setSlidersOpen(true)} />
          <Row label="Stats & Taste DNA" to="/stats" />
        </div>
        <div className="card mt16">
          <Row label="Back up my library" sub={settings?.lastBackupAt ? `Last backup ${new Date(settings.lastBackupAt).toLocaleDateString()}` : 'Never backed up'} onClick={() => setBackupOpen(true)} />
          <Row label="Restore backup" onClick={() => fileRef.current?.click()} />
          <Row label="Import from Letterboxd" sub="Runs entirely on this device" onClick={() => setImportOpen(true)} />
        </div>
        <div className="card mt16">
          <Row label="Storage" sub={usage} onClick={() => { setStorageOpen(true); void estimate(); }} />
          <Row label="Privacy" onClick={() => setPrivacyOpen(true)} />
          <Row label="About sources" sub="TMDB, JustWatch availability" onClick={() => toast('Metadata and artwork: TMDB. Streaming availability: JustWatch via TMDB. IMDb, Rotten Tomatoes and Letterboxd ratings are linked, never scraped.')} />
        </div>
        <div className="card mt16">
          <Row label="Delete personal data" danger onClick={() => setWipeOpen(true)} />
        </div>
        <div className="caption center mt16">Slate {APP_VERSION} · No account · No servers · Your data stays on this device</div>
      </div>

      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onRestoreFile(f); e.target.value = ''; }} />
      <input ref={importRef} type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.length) void onImportFiles(e.target.files); e.target.value = ''; }} />

      {/* providers sheet */}
      <Sheet open={providersOpen} onClose={() => setProvidersOpen(false)} title="Your streaming services">
        <div className="row wrap" style={{ gap: 8 }}>
          {providers.map((p) => {
            const on = settings?.watchProviders.includes(p.id);
            return (
              <button key={p.id} className={`chip ${on ? 'on' : ''}`} onClick={() => {
                if (!settings) return;
                void saveSettings({ watchProviders: on ? settings.watchProviders.filter((x) => x !== p.id) : [...settings.watchProviders, p.id] });
              }}>
                {p.logoPath && <img src={logoUrl(p.logoPath, 'w45') ?? ''} width={18} height={18} style={{ borderRadius: 4 }} alt="" />}{p.name}
              </button>
            );
          })}
          {!providers.length && <p className="footnote">{online ? 'Loading...' : 'Unavailable offline.'}</p>}
        </div>
      </Sheet>

      {/* sliders sheet */}
      <Sheet open={slidersOpen} onClose={() => setSlidersOpen(false)} title="Taste sliders">
        {settings && (Object.entries({ comfortingDark: ['Comforting', 'Dark'], easyCerebral: ['Easy', 'Cerebral'], fastSlow: ['Fast paced', 'Slow burn'], realisticFantastical: ['Realistic', 'Fantastical'], mainstreamObscure: ['Mainstream', 'Obscure'] }) as [keyof SliderSet, [string, string]][]).map(([k, [l, r]]) => (
          <LabeledSlider key={k} left={l} right={r} value={settings.sliders[k]} onChange={(v) => saveSettings({ sliders: { ...settings.sliders, [k]: v } })} />
        ))}
      </Sheet>

      {/* backup sheet */}
      <Sheet open={backupOpen} onClose={() => setBackupOpen(false)} title="Back up my library">
        <p className="subhead" style={{ marginBottom: 14 }}>One file with your watchlist, ratings, reviews, diary, lists, TV progress, taste profile and settings. On iPhone, use the share sheet to save it to Files or iCloud Drive.</p>
        <button className="btn btn-primary btn-block" onClick={doBackup}><IconDownload /> Export backup</button>
        <div className="divider" />
        <div className="field"><label>Backup reminders</label>
          <Segmented value={settings?.backupReminder ?? 'changes'} onChange={(v) => saveSettings({ backupReminder: v as 'monthly' | 'changes' | 'never' })} options={[{ value: 'changes', label: 'After changes' }, { value: 'monthly', label: 'Monthly' }, { value: 'never', label: 'Never' }]} />
        </div>
      </Sheet>

      {/* restore confirm */}
      <Sheet open={!!restore} onClose={() => setRestore(null)} title="Restore backup">
        {restore?.counts && (
          <>
            <p className="subhead" style={{ marginBottom: 6 }}>Backup from {restore.date ? new Date(restore.date).toLocaleString() : 'unknown date'}</p>
            <p className="footnote" style={{ marginBottom: 16 }}>{restore.counts.titles} titles · {restore.counts.ratings} ratings · {restore.counts.watched} watched · {restore.counts.lists} lists · {restore.counts.diary} diary entries</p>
            <button className="btn btn-primary btn-block" onClick={async () => { await restoreBackup(restore.backup!, 'merge'); setRestore(null); toast('Backup merged'); }}>Merge with current library</button>
            <button className="btn btn-destructive btn-block mt8" onClick={async () => { await restoreBackup(restore.backup!, 'replace'); setRestore(null); toast('Library replaced from backup'); }}>Replace current library</button>
            <button className="btn btn-ghost btn-block mt8" onClick={() => setRestore(null)}>Cancel</button>
          </>
        )}
      </Sheet>

      {/* import sheet */}
      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Import from Letterboxd">
        <p className="subhead" style={{ marginBottom: 12 }}>Export your data from letterboxd.com/settings/data, then choose the CSV files here. Files are parsed on this device and never uploaded.</p>
        <button className="btn btn-primary btn-block" disabled={importing} onClick={() => importRef.current?.click()}>{importing ? 'Matching titles...' : 'Choose CSV files'}</button>
        {importState && (
          <div className="mt16">
            <div className="headline">{importState.matches.length} rows need review</div>
            {importState.matches.slice(0, 30).map((m, i) => (
              <div key={i} className="mt16">
                <div className="body">{m.row.title}{m.row.year ? ` (${m.row.year})` : ''}</div>
                {m.status === 'ambiguous' && m.candidates ? (
                  <div className="row wrap mt8" style={{ gap: 6 }}>
                    {m.candidates.map((c) => (
                      <button key={c.key} className="chip" onClick={async () => { await applyMatch(importState.plan, { ...m, status: 'matched', key: c.key }); setImportState((s) => s ? { ...s, matches: s.matches.filter((x) => x !== m) } : s); toast(`Matched ${c.title}`); }}>{c.title} {c.year ?? ''}</button>
                    ))}
                  </div>
                ) : <div className="caption mt8">No automatic match found</div>}
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* storage sheet */}
      <Sheet open={storageOpen} onClose={() => setStorageOpen(false)} title="Storage">
        <div className="spread"><span className="body">Local usage</span><span className="footnote num">{usage}</span></div>
        <div className="divider" />
        <button className="btn btn-secondary btn-block" onClick={async () => { await db.metaCache.clear(); if ('caches' in window) { const keys = await caches.keys(); for (const k of keys.filter((x) => x.includes('tmdb-images'))) await caches.delete(k); } toast('Image and metadata cache cleared'); }}>Clear image & metadata cache</button>
        <button className="btn btn-secondary btn-block mt8" onClick={async () => { await saveSettings({ searchHistory: [] }); toast('Search history cleared'); }}>Clear search history</button>
        <p className="caption mt16">Clearing caches never touches your library, ratings, reviews or diary.</p>
      </Sheet>

      {/* privacy sheet */}
      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy">
        <div className="row" style={{ gap: 10, marginBottom: 12 }}><IconShield /><span className="headline">Private by architecture</span></div>
        <p className="subhead">Your library, ratings, reviews, viewing history, recommendations, and taste profile are stored only on this device. No account is required. No personal viewing data is sent to our servers because there are no user-data servers.</p>
        <p className="subhead mt16">The only network requests are to TMDB's public catalog (title searches, title IDs, artwork) and carry no personal information. Recommendation calculations run entirely in this app.</p>
      </Sheet>

      <ConfirmSheet open={wipeOpen} onClose={() => setWipeOpen(false)} title="Delete personal data?"
        body="This permanently removes your library, ratings, reviews, diary, lists, taste profile and settings from this device. Cached artwork may remain. Consider exporting a backup first."
        confirmLabel="Delete everything" destructive
        onConfirm={async () => { await wipeAll(); toast('All personal data deleted'); window.location.href = '/'; }} />
    </div>
  );
}
