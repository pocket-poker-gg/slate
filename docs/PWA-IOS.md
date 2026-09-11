# PWA on iOS

- Standalone display, `viewport-fit=cover`, safe-area insets respected everywhere (top bar, bottom nav, sheets, home indicator).
- Black-translucent status bar; theme-color follows the selected appearance.
- Home Screen icon: bundled 180px apple-touch-icon; maskable icons included for other platforms.
- Service worker (Workbox): precaches the app shell, CacheFirst for TMDB artwork, NetworkFirst for TMDB API. After the first visit, your library, diary, lists, cached artwork, and local recommendations all work offline; searching new titles shows an honest offline state.
- Updates: new versions install in the background and show a quiet "New version available - Update" bar. Slate never reloads while you are writing.
- Install: open the URL in Safari -> Share -> Add to Home Screen.
