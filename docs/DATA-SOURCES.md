# Data sources

## TMDB (themoviedb.org)
Primary catalog: search, trending, popular, top rated, discover, full title details (genres, keywords, cast, crew, runtime, seasons/episodes, certification, trailers, external IDs), streaming-provider availability (JustWatch data exposed by TMDB), recommendations and similar titles.

All requests originate directly from the PWA and contain only what a public catalog query needs: a search string, a title ID, or filter parameters. No ratings, history, lists, or any personal data ever leave the device.

Caching: detail responses cached 14 days, search 6 hours, lists 12 hours, providers 3 days, seasons 7 days - in IndexedDB plus a service-worker network-first layer.

## IMDb / Rotten Tomatoes / Letterboxd
These services do not offer free, lawful, automatic rating APIs for client-side apps, and Slate never scrapes them. The rating provider interface (`src/providers/ratings.ts`) is modular: each source can be backed by an official API, a lawful dataset, a user import, or an honest "Unavailable automatically" state with an outbound link. Today TMDB is the automatic source; IMDb/RT/Letterboxd render as unavailable-with-link rather than fabricated numbers. Letterboxd data can enter via the local CSV import (ratings, watched, diary, reviews, watchlist).
