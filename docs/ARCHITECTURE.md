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

## Discovery (src/recommendation/discovery.ts)
Discover runs on real TMDB discover feeds, never canned lists. Summary-level
scoring gives every card a real match score without detail hydration (genre
affinity from the on-device taste model, bayesian quality, novelty, daily
exploration salt). Dials change the actual API request (sort, vote floor,
runtime cap) and the ranking. Hidden gems = high rating + low votes. Infinite
scroll paginates the catalog with dedupe; watched/dropped/not-interested/
dismissed titles are excluded; a fresh profile degrades to an honest
quality + novelty blend and says so. Home shelves are all data-earned:
day-salted recommendations, live trending minus the library, next-episode air
dates for caught-up shows.
