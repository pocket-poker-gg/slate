# Privacy

Your library, ratings, reviews, viewing history, recommendations, and taste profile are stored only on your device. No account is required. No personal viewing data is sent to our servers because there are no user-data servers.

## What leaves the device
Only public-catalog queries to TMDB: the text you search for, title IDs you view, and filter parameters for discovery. These requests contain no ratings, no history, no identifiers beyond TMDB's shared public API key, and no behavioral data.

## What never leaves the device
Watchlist, watched history, ratings, reviews, diary, episode progress, favorites, lists, tags, notes, recommendation feedback, onboarding selections, taste profile, recommendation model state, pairwise preference data, search history, dismissed recommendations, settings, and streaming-service selections.

## Imports
Letterboxd CSV files are parsed locally in the browser. They are never uploaded anywhere.

## Backups
Backups are plain files you export yourself (ideally via the iOS share sheet into iCloud Drive). Restore reads the file locally.

## Network inspection
Open your browser's network inspector: the only hosts contacted are `api.themoviedb.org` and `image.tmdb.org` (plus your static host serving the app itself).
