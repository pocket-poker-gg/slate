# Slate

Your movies and shows. Your taste. Your data. Only on this device.

Slate is a local-first Progressive Web App for discovering, tracking, rating, reviewing, organizing, and intelligently choosing television shows and movies. It combines the strongest aspects of Letterboxd, IMDb, Rotten Tomatoes, Serializd, Trakt, JustWatch, and Apple TV into a personal entertainment intelligence system whose core question is: **"What should I actually watch?"**

## Principles

- **Private by architecture** - no account, no auth, no backend, no server database, no analytics, no telemetry. All personal data lives in your browser's IndexedDB.
- **Zero cost, forever** - static hosting only; the only external dependency is the free public TMDB metadata API.
- **Zero maintenance** - no server to patch, no database to administer, no cron, no queues.
- **iPhone first** - designed and verified at real iPhone dimensions; installable PWA with offline support.

## Quick start

```bash
npm install
npm run dev      # local dev server
npm test         # unit + integration tests (incl. the 100-title backup/restore data-safety test)
npm run build    # production build -> dist/
```

Deploy: upload `dist/` to any static host (see docs/DEPLOYMENT.md).

## Stack

TypeScript, React, Vite, Dexie (IndexedDB), vite-plugin-pwa (Workbox), hand-built design system. No UI frameworks, no chart libraries, no backend anything.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Local storage](docs/LOCAL-STORAGE.md)
- [Recommendation engine](docs/RECOMMENDATIONS.md)
- [Data sources](docs/DATA-SOURCES.md)
- [Backup & restore](docs/BACKUP-RESTORE.md)
- [PWA on iOS](docs/PWA-IOS.md)
- [Privacy](docs/PRIVACY.md)
- [Deployment](docs/DEPLOYMENT.md)
