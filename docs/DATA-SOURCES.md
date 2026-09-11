# Data sources

## TMDB (themoviedb.org)
Primary catalog: search, trending, popular, top rated, discover, full title details (genres, keywords, cast, crew, runtime, seasons/episodes, certification, trailers, external IDs), streaming-provider availability (JustWatch data exposed by TMDB), recommendations and similar titles.

All requests originate directly from the PWA and contain only what a public catalog query needs: a search string, a title ID, or filter parameters. No ratings, history, lists, or any personal data ever leave the device.

Caching: detail responses cached 14 days, search 6 hours, lists 12 hours, providers 3 days, seasons 7 days - in IndexedDB plus a service-worker network-first layer.

## IMDb (official non-commercial dataset)
IMDb publishes daily rating snapshots (title.ratings.tsv.gz) at datasets.imdbws.com for personal/non-commercial use. At build time, `scripts/build-imdb-ratings.mjs` filters that file to titles with 1,000+ votes and emits ~2.3 MB of small sharded JSON files (`public/imdb-ratings/`, not committed). The app lazy-loads one ~18 KB shard per title and caches it on-device (IndexedDB 7 days + service worker). The full dataset never ships to the client. Rating + vote count appear on the title page with a link to IMDb.

## Rotten Tomatoes + Metacritic (OMDb)
Neither offers a free official API. OMDb (omdbapi.com, CC BY-NC 4.0) is a lawful aggregator: one free key, called client-side by IMDb ID only (cached 3 days on-device). It supplies the Rotten Tomatoes Tomatometer and the Metacritic Metascore, and mirrors the IMDb score as a fallback when a title is below the dataset's vote threshold. Labels stay honest: the Tomatometer is the percentage of critics who rated positively, not an average rating.

## Reviews (TMDB user reviews)
Review text comes exclusively from TMDB's public API (`/{movie,tv}/{id}/reviews`), surfaced as "Community reviews" on title pages with author, optional author score, snippet + expansion, and a link to the full review. Review text is never scraped from IMDb, Rotten Tomatoes, or Google.

## Google / Letterboxd
Google shows ratings only inside its own results and Letterboxd has no free lawful API; both render as an honest "unavailable" state with an outbound link rather than a fabricated number. Letterboxd data can enter via the local CSV import (ratings, watched, diary, reviews, watchlist). The provider interface (`src/providers/ratings.ts`) stays modular: official API, lawful dataset, user import, or honest unavailable - never a scrape.
