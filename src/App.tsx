import { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSettings } from './ui/hooks';
import { ToastProvider } from './ui/components';
import { Suspense, lazy } from 'react';
import Home from './ui/screens/Home';
import Onboarding from './ui/screens/Onboarding';
// Route-level code splitting: only the shell + Home ship in the initial chunk.
const Tonight = lazy(() => import('./ui/screens/Tonight'));
const Discover = lazy(() => import('./ui/screens/Discover'));
const Search = lazy(() => import('./ui/screens/Search'));
const Library = lazy(() => import('./ui/screens/Library'));
const ListDetail = lazy(() => import('./ui/screens/ListDetail'));
const TitleDetail = lazy(() => import('./ui/screens/TitleDetail'));
const SeasonDetail = lazy(() => import('./ui/screens/SeasonDetail'));
const Diary = lazy(() => import('./ui/screens/Diary'));
const Triage = lazy(() => import('./ui/screens/Triage'));
const Stats = lazy(() => import('./ui/screens/Stats'));
const YearInReview = lazy(() => import('./ui/screens/YearInReview'));
const Profile = lazy(() => import('./ui/screens/Profile'));
const Calibrate = lazy(() => import('./ui/screens/Calibrate'));
const Category = lazy(() => import('./ui/screens/Category'));

// Warm the route chunks after first paint so taps never wait on the network.
const warmRoutes = () => {
  void import('./ui/screens/Discover');
  void import('./ui/screens/Search');
  void import('./ui/screens/Library');
  void import('./ui/screens/TitleDetail');
  void import('./ui/screens/Tonight');
  void import('./ui/screens/Diary');
  void import('./ui/screens/Profile');
  void import('./ui/screens/SeasonDetail');
  void import('./ui/screens/Stats');
  void import('./ui/screens/Triage');
  void import('./ui/screens/ListDetail');
  void import('./ui/screens/YearInReview');
  void import('./ui/screens/Category');
};
import { IconHome, IconCompass, IconLibrary, IconDiary, IconProfile } from './ui/icons';
import { loadGenreMaps } from './providers/tmdb';

function BottomNav() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/onboarding')) return null;
  if (loc.pathname.startsWith('/title/') || loc.pathname.startsWith('/browse/') || loc.pathname === '/triage' || loc.pathname === '/calibrate') return null;
  const item = (to: string, label: string, icon: React.ReactNode) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')} end={to === '/'} aria-label={label}>{icon}{label}</NavLink>
  );
  return (
    <nav className="bottomnav">
      {item('/', 'Home', <IconHome />)}
      {item('/discover', 'Discover', <IconCompass />)}
      {item('/library', 'Library', <IconLibrary />)}
      {item('/diary', 'Diary', <IconDiary />)}
      {item('/profile', 'Profile', <IconProfile />)}
    </nav>
  );
}

// Per-path scroll memory: leaving a tab saves its position; returning
// restores it (content renders instantly from session caches, so the restore
// lands without a jump). New pages still start at the top.
const scrollMemory = new Map<string, number>();
function ScrollRestore() {
  const loc = useLocation();
  const pathRef = useRef(loc.pathname);
  pathRef.current = loc.pathname;
  // Track scroll continuously: by the time a route-change effect runs, the
  // shorter incoming page has already clamped window.scrollY, so a
  // save-on-leave would record the wrong position.
  useEffect(() => {
    const onScroll = () => scrollMemory.set(pathRef.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { onScroll(); window.removeEventListener('scroll', onScroll); };
  }, []);
  useEffect(() => {
    const y = scrollMemory.get(loc.pathname);
    if (y === undefined) return;
    // Content renders from session caches with fixed-geometry cards, so two
    // frames is normally enough; the delayed retry covers late growth.
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    const t = window.setTimeout(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo(0, y); }, 300);
    return () => window.clearTimeout(t);
  }, [loc.pathname]);
  return null;
}

function ThemeManager() {
  const settings = useSettings();
  useEffect(() => {
    // localStorage mirror avoids a dark->light (or light->dark) first-frame flash
    let stored = 'system';
    try { stored = localStorage.getItem('slate.theme') ?? 'system'; } catch { /* ignore */ }
    const theme = settings?.theme ?? stored;
    if (settings?.theme) { try { localStorage.setItem('slate.theme', settings.theme); } catch { /* ignore */ } }
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f5f5f7');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.theme]);
  return null;
}

function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-bar">
      <div className="card card-pad row" style={{ gap: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <span className="body grow">New version available</span>
        <button className="btn btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>Update</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setNeedRefresh(false)}>Later</button>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    void loadGenreMaps();
    const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
    idle(warmRoutes);
    // Ask the OS to never evict this origin's data (best-effort, silent).
    void navigator.storage?.persist?.().catch(() => {});
  }, []);
  return (
    <HashRouter>
      <ToastProvider>
        <ThemeManager />
        <ScrollRestore />
        <div className="app">
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/tonight" element={<Tonight />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/browse/:mediaType/:hubId" element={<Category />} />
            <Route path="/search" element={<Search />} />
            <Route path="/library" element={<Library />} />
            <Route path="/lists/:id" element={<ListDetail />} />
            <Route path="/title/:mediaType/:id" element={<TitleDetail />} />
            <Route path="/title/tv/:id/season/:season" element={<SeasonDetail />} />
            <Route path="/diary" element={<Diary />} />
            <Route path="/triage" element={<Triage />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/year/:year" element={<YearInReview />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/calibrate" element={<Calibrate />} />
          </Routes>
          </Suspense>
          <BottomNav />
          <UpdatePrompt />
        </div>
      </ToastProvider>
    </HashRouter>
  );
}
