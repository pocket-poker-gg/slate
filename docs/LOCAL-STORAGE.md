# Local storage

Primary persistence: **IndexedDB** via Dexie (database `slate`, schema version 1).

| Table | Contents |
|---|---|
| `titles` | Cached title metadata (summary + full detail levels) so the library renders offline |
| `library` | One row per title you touched: status, rating, review, favorite, tags, notes, priority, watch flags |
| `progress` | Per-series episode progress (`S:E` -> watched timestamp/rating) |
| `diary` | Viewing diary entries (movies, episodes, rewatches, ratings) |
| `lists`, `listItems` | Custom lists and their members |
| `pairwise` | Pairwise calibration choices |
| `settings` | Theme, region, streaming services, taste sliders, discovery dials, backup prefs, search history, onboarding flag |
| `metaCache` | TTL cache for TMDB API responses (`{data, fetchedAt, expiresAt}`) |
| `recFeedback` | Recommendation feedback (dismiss / more like this / less / skip / picked / not interested) |
| `imports` | Import history summaries |

Cache Storage (service worker): the app shell and static assets (precache), TMDB images (CacheFirst, 60 days, 2000 entries), TMDB API responses (NetworkFirst, 7 days).

LocalStorage: nothing meaningful - settings live in IndexedDB.

Storage durability: the app works entirely within the browser's storage. iOS may evict website data for unused, non-installed sites; installing the PWA to the Home Screen and keeping a backup file (one tap in Profile) is the durable path.
