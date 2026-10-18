import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  House, MagnifyingGlass, FilmSlate, Television, Sparkle,
  BookmarkSimple, GearSix, CaretLeft,
} from '@phosphor-icons/react';
import DesktopTitlebar from '@app/components/DesktopTitlebar';
import Home from './screens/Home';
import Search from './screens/Search';
import Watch from './screens/Watch';
import Anime from './screens/Anime';
import Discover from './screens/Discover';
import Details from './screens/Details';
import Favourites from './screens/Favourites';
import Schedule from './screens/Schedule';
import Legal from './screens/Legal';
import Settings from './screens/Settings';
import CommandPalette from './components/CommandPalette';
import { CalendarBlank, Scales, SquaresFour } from '@phosphor-icons/react';
import { usePersistence } from '@app/hooks/usePersistence';
import { useState, useEffect } from 'react';
import { loadUiPrefs, saveUiPrefs } from './ui-prefs';

// ── Left icon rail (primary nav) — strict 8px rhythm, one icon family ───────
const NAV = [
  { to: '/', icon: House, label: 'Home', end: true },
  { to: '/search', icon: MagnifyingGlass, label: 'Search' },
  { to: '/anime', icon: Sparkle, label: 'Anime' },
  { to: '/discover/movie', icon: FilmSlate, label: 'Movies' },
  { to: '/discover/tv', icon: Television, label: 'Series' },
  { to: '/schedule', icon: CalendarBlank, label: 'Schedule' },
  { to: '/favourites', icon: BookmarkSimple, label: 'Watchlist' },
  { to: '/discover/popular', icon: SquaresFour, label: 'Popular' },
  { to: '/legal', icon: Scales, label: 'Legal' },
];

function Rail({ onCollapse }) {
  return (
    <nav
      className="flex w-[72px] shrink-0 flex-col items-center border-r py-4"
      style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-bg-elev-0)' }}
      aria-label="Primary"
    >
      <div className="mb-6 grid h-9 w-9 place-items-center">
        <span className="kz-display text-2xl font-bold leading-none text-[var(--kz-text)]">
          K<span style={{ color: 'var(--kz-accent)' }}>.</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-2">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to} to={to} end={end} title={label} aria-label={label}
            className={({ isActive }) =>
              `group relative grid h-11 w-11 place-items-center rounded-xl transition-colors duration-200 kz-focus-ring ${
                isActive ? 'text-white' : 'text-[var(--kz-text-muted)] hover:text-white hover:bg-white/[0.06]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl"
                    style={{ background: 'var(--kz-accent-soft)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                )}
                <Icon size={23} weight={isActive ? 'fill' : 'regular'} className="relative" />
              </>
            )}
          </NavLink>
        ))}
      </div>

      <button onClick={onCollapse} title="Collapse sidebar" aria-label="Collapse sidebar"
        className="grid h-11 w-11 place-items-center rounded-xl text-[var(--kz-text-muted)] transition-colors hover:text-white hover:bg-white/[0.06] kz-focus-ring">
        <CaretLeft size={20} weight="bold" />
      </button>
      <NavLink to="/settings" title="Settings" aria-label="Settings"
        className="grid h-11 w-11 place-items-center rounded-xl text-[var(--kz-text-muted)] transition-colors hover:text-white hover:bg-white/[0.06] kz-focus-ring">
        <GearSix size={23} />
      </NavLink>
    </nav>
  );
}

function titleForPath(pathname) {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/search')) return 'Search';
  if (pathname.startsWith('/anime')) return 'Anime';
  if (pathname.startsWith('/discover/movie')) return 'Movies';
  if (pathname.startsWith('/discover/tv')) return 'Series';
  if (pathname.startsWith('/discover/popular')) return 'Popular';
  if (pathname.startsWith('/discover')) return 'Discover';
  if (pathname.startsWith('/details')) return 'Details';
  if (pathname.startsWith('/schedule')) return 'Schedule';
  if (pathname.startsWith('/favourites') || pathname.startsWith('/watchlist')) return 'Watchlist';
  if (pathname.startsWith('/legal')) return 'Legal';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/watch/') || pathname.startsWith('/play/')) return 'Now Playing';
  return 'Kakumei';
}

export default function DesktopApp() {
  const location = useLocation();
  usePersistence(); // activate cloud sync when the desktop app is signed in
  const [uiPrefs, setUiPrefs] = useState(loadUiPrefs);
  useEffect(() => {
    const sync = () => setUiPrefs(loadUiPrefs());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const toggleSidebar = () => {
    const next = { ...loadUiPrefs(), sidebar: !(uiPrefs.sidebar !== false) };
    setUiPrefs(next);
    saveUiPrefs(next);
  };
  // Player route is full-bleed — no rail, immersive.
  const isWatch = location.pathname.startsWith('/watch/') || location.pathname.startsWith('/play/');
  const headerTitle = titleForPath(location.pathname);
  const railOpen = uiPrefs.sidebar !== false;

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--kz-bg)' }}>
      <DesktopTitlebar title={headerTitle} onMenu={isWatch ? undefined : toggleSidebar} menuOpen={railOpen} />
      <div className="flex min-h-0 flex-1">
        {!isWatch && railOpen && <Rail onCollapse={toggleSidebar} />}
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<Search />} />
            <Route path="/watch/:type/:id" element={<Watch />} />
            <Route path="/play/:type/:id" element={<Watch />} />
            <Route path="/anime" element={<Anime />} />
            <Route path="/discover/:category" element={<Discover />} />
            <Route path="/details/:type/:id" element={<Details />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/favourites" element={<Favourites />} />
            <Route path="/watchlist" element={<Favourites />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
