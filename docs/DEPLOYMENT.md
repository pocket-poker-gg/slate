# Deployment

Slate builds to static files (`npm run build` -> `dist/`). Any static host works; the app is deployed on Cloudflare's free tier, which cannot bill because the account has no payment method attached.

## Cloudflare (current)
Static assets served from the free tier. SPA fallback routes all paths to `index.html`.

## Any static host
Upload `dist/` with two rules:
1. Serve `index.html` for unknown paths (SPA fallback).
2. Let `sw.js` bypass caching (`Cache-Control: no-cache`) so updates are detected promptly.

## Cost
$0/month. The only external dependency is TMDB's free public API. No server, database, auth, or paid service exists to maintain.

## TMDB key
The app ships with a free TMDB developer key for its public metadata API (client-side by design; the key grants read-only access to public catalog data). To use your own key instead, replace `TMDB_API_KEY` in `src/data/config.ts` - the one-time procedure: create a free account at themoviedb.org, then Settings -> API -> request a developer key.
