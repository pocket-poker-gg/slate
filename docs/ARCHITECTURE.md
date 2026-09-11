# Architecture

Slate is a static single-page application. The host serves files; everything else happens on the device.

```
Static host (Cloudflare) -> iPhone PWA
  -> IndexedDB (Dexie): all personal data + metadata cache
  -> Service Worker (Workbox): app shell precache, TMDB image/API runtime cache
  -> Local recommendation engine (deterministic, no ML service)
  -> TMDB public API: metadata, artwork, streaming availability (via JustWatch data)
```

## Module map (`src/`)

- `/data` - domain types, config, small utilities
- `/storage` - Dexie schema + migrations (`db.ts`), repository operations (`repo.ts`)
- `/providers` - TMDB adapter with TTL caching (`tmdb.ts`), modular external-rating providers (`ratings.ts`)
- `/recommendation` - taste model (`taste.ts`), scoring/diversity (`engine.ts`), deterministic explanations (`explain.ts`), predictions (`predict.ts`), orchestration + Tonight Mode (`recommend.ts`)
- `/import` - Letterboxd CSV parsing/matching, fully local
- `/export` - backup creation, validation, restore, wipe
- `/analytics` - year stats, Taste DNA, source alignment (Pearson), taste evolution
- `/ui` - design system (`theme.css`), shared components, screens
- `/pwa` - (service worker configured via vite-plugin-pwa in `vite.config.ts`)

There is no server-side code anywhere in the repository.

## Schema versioning

IndexedDB schema is versioned through Dexie (`db.version(N)`). Backups carry their own `format`/`version` envelope and are validated before restore. See docs/LOCAL-STORAGE.md and docs/BACKUP-RESTORE.md.
