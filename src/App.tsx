import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSettings } from './ui/hooks';
import { ToastProvider } from './ui/components';
import Home from './ui/screens/Home';
import Tonight from './ui/screens/Tonight';
import Discover from './ui/screens/Discover';
import Search from './ui/screens/Search';
import Library from './ui/screens/Library';
import ListDetail from './ui/screens/ListDetail';
import TitleDetail from './ui/screens/TitleDetail';
import SeasonDetail from './ui/screens/SeasonDetail';
import Diary from './ui/screens/Diary';
import Triage from './ui/screens/Triage';
import Stats from './ui/screens/Stats';
import YearInReview from './ui/screens/YearInReview';
import Profile from './ui/screens/Profile';
import Onboarding from './ui/screens/Onboarding';
import { IconHome, IconCompass, IconLibrary, IconDiary, IconProfile } from './ui/icons';
import { loadGenreMaps } from './providers/tmdb';

function BottomNav() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/onboarding')) return null;
  if (loc.pathname.startsWith('/title/') || loc.pathname === '/triage') return null;
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

function ScrollRestore() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return null;
}

function ThemeManager() {
  const settings = useSettings();
  useEffect(() => {
    const theme = settings?.theme ?? 'system';
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
  useEffect(() => { void loadGenreMaps(); }, []);
  return (
    <HashRouter>
      <ToastProvider>
        <ThemeManager />
        <ScrollRestore />
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/tonight" element={<Tonight />} />
            <Route path="/discover" element={<Discover />} />
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
          </Routes>
          <BottomNav />
          <UpdatePrompt />
        </div>
      </ToastProvider>
    </HashRouter>
  );
}
