import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
/* ── Custom SVG Icons ── */
const SvgHome = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 21v-6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v6"/><path d="M3 12l9-9 9 9"/><path d="M5 10v11h14V10"/></svg>;
const SvgFilm = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 7h5M2 17h5M17 7h5M17 17h5M2 12h20"/></svg>;
const SvgTv = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/></svg>;
const SvgSparkles = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/><path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill={c} opacity="0.3"/></svg>;
const SvgFlame = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 12c2-3 4-3 5-6-1 3-3 4-5 6"/><path d="M8.5 16c-1-1-1.5-2.5-.5-4 1 2 2 2 3 4"/><path d="M15.5 16c1-1 1.5-2.5.5-4-1 2-2 2-3 4"/><path d="M12 20c-3.5 0-5.5-2.5-5.5-6 0 4 2.5 5.5 5.5 6 3 0 5.5-1.5 5.5-6 0 3.5-2 6-5.5 6z"/></svg>;
const SvgStar = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const SvgCompass = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>;
const SvgHeart = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>;
const SvgBookmark = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;
const SvgTrendingUp = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;
const SvgClock = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const SvgShieldAlert = ({s=17, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const SvgChevronDown = ({s=13, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>;
const SvgChevronRight = ({s=13, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="9 18 15 12 9 6"/></svg>;
const SvgX = ({s=15, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const SvgTag = ({s=11, c='currentColor', ...p}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill={c}/></svg>;

const SVG = { home: SvgHome, film: SvgFilm, tv: SvgTv, sparkles: SvgSparkles, flame: SvgFlame, star: SvgStar, compass: SvgCompass, heart: SvgHeart, bookmark: SvgBookmark, trendingUp: SvgTrendingUp, clock: SvgClock, shieldAlert: SvgShieldAlert };
import { useAuth } from '../context/AuthContext';

/* ── Genre list ── */
const GENRES = [
  { id: 28,    name: 'Action' },
  { id: 35,    name: 'Comedy' },
  { id: 18,    name: 'Drama' },
  { id: 27,    name: 'Horror' },
  { id: 10749, name: 'Romance' },
  { id: 878,   name: 'Sci-Fi' },
  { id: 16,    name: 'Animation' },
  { id: 12,    name: 'Adventure' },
  { id: 53,    name: 'Thriller' },
  { id: 14,    name: 'Fantasy' },
];

/* ── Nav structure ── */
const TOP_NAV = [
  { name: 'Home',             path: '/',                  icon: 'home',      end: true },
  { name: 'Anime',            path: '/anime',             icon: 'sparkles' },
  { name: 'Trending',         path: '/discover/popular',  icon: 'trendingUp' },
  { name: 'Continue Watching',path: '/#continue',         icon: 'clock'      },
];

const EXPANDABLE = [
  {
    key: 'movies',
    label: 'Movies',
    icon: 'film',
    accent: '#a855f7',
    children: [
      { name: 'All Movies',      path: '/discover/movie'          },
      { name: 'Popular',         path: '/discover/popular'        },
      { name: 'Latest Releases', path: '/discover/movie?sort=newest' },
      { name: 'Top Rated',       path: '/discover/top-rated'      },
    ],
    genres: true,
  },
  {
    key: 'anime',
    label: 'Anime',
    icon: 'sparkles',
    accent: '#fb923c',
    children: [
      { name: 'All Anime',    path: '/anime'                       },
      { name: 'Trending (AniList)', path: '/discover/anime?provider=anilist&sort=trending', tag: 'ANILIST' },
      { name: 'Ongoing (AniList)', path: '/discover/anime?provider=anilist&status=releasing', tag: 'LIVE' },
      { name: 'Series',       path: '/discover/anime'              },
      { name: 'Release Schedule', path: '/schedule', tag: 'NEW'    },
    ],
  },
  {
    key: '18+',
    label: '18+',
    icon: 'shieldAlert',
    accent: '#ef4444',
    children: [
      { name: 'All 18+',     path: '/discover/adult' },
    ],
  },
  {
    key: 'tv',
    label: 'TV Shows',
    icon: 'tv',
    accent: '#38bdf8',
    children: [
      { name: 'All Series',   path: '/discover/tv'             },
      { name: 'Ongoing',   path: '/discover/tv?status=ongoing', tag: 'LIVE' },
      { name: 'Completed',    path: '/discover/tv?status=ended'   },
      { name: 'Top Rated',    path: '/discover/tv?sort=rating'    },
    ],
  },
];

/* ── Tag badge ── */
function Tag_({ text }) {
  const colors = { LIVE: ['#ef4444', '#fca5a5'], NEW: ['#a855f7', '#d8b4fe'], ANILIST: ['#3b82f6', '#93c5fd'] };
  const [bg, fg] = colors[text] || ['#3f3f46', '#a1a1aa'];
  return (
    <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: `${bg}25`, color: fg, border: `1px solid ${bg}40`, letterSpacing: '0.06em', flexShrink: 0 }}>
      {text}
    </span>
  );
}

/* ── Expandable section ── */
function ExpandSection({ section, collapsed }) {
  const [open, setOpen] = useState(true);
  const [genreOpen, setGenreOpen] = useState(false);
  const Icon = SVG[section.icon];

  if (collapsed) {
    return (
      <div title={section.label} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${section.accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
          {Icon && <Icon s={16} c={section.accent} />}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-none cursor-pointer transition-colors duration-150 hover:bg-white/[0.05]">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${section.accent}18` }}>
          {Icon && <Icon s={14} c={section.accent} />}
        </div>
        <span className="flex-1 text-left text-[13px] font-medium" style={{ color: open ? '#e4e4e7' : '#71717a' }}>{section.label}</span>
        <SvgChevronDown s={13} c="#52525b" className="shrink-0 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {/* Children */}
      {open && (
        <div className="ml-9 mt-0.5 mb-1 flex flex-col animate-fadeUp">
          {section.children.map(child => (
            <Link key={child.name} to={child.path}
              className="sidebar-link flex items-center justify-between px-2.5 py-2 rounded-lg no-underline text-xs text-zinc-500"
            >
              <span>{child.name}</span>
              {child.tag && <Tag_ text={child.tag} />}
            </Link>
          ))}

          {/* Genres sub-section */}
          {section.genres && (
            <div>
              {/* No leading icon — the sibling links above have none, so the
                  tag icon here broke the vertical scan line of the labels. */}
              <button onClick={() => setGenreOpen(!genreOpen)}
                className="sidebar-btn flex items-center px-2.5 py-2 w-full rounded-lg border-none bg-transparent cursor-pointer text-xs text-zinc-600"
              >
                <span>Genres</span>
                <SvgChevronDown s={11} c="#71717a" className="ml-auto transition-transform duration-200" style={{ transform: genreOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {genreOpen && (
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 animate-fadeUp">
                  {GENRES.map(g => (
                    <Link key={g.id} to={`/discover/movie?genre=${g.id}`}
                      className="sidebar-genre-chip text-[10px] font-medium px-2.5 py-1 rounded-full no-underline"
                      style={{ '--accent': section.accent, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#52525b' }}
                    >{g.name}</Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Sidebar ── */
export default function Sidebar({ isOpen, onToggle }) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [watchlist, setWatchlist] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('bookmark_'));
      setWatchlist(keys.length);
    };
    updateCount();
    window.addEventListener('storage', updateCount);
    return () => window.removeEventListener('storage', updateCount);
  }, []);

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          onClick={onToggle}
          className="lg:hidden fixed inset-0 bg-zinc-950/90 z-[55] animate-fadeIn" 
        />
      )}

      <aside 
        className={`
          fixed lg:sticky top-0 lg:top-16 left-0 z-[58] flex flex-col
          bg-zinc-950 border-r border-white/5 will-change-transform
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          w-[280px] ${collapsed ? 'lg:w-[72px]' : 'lg:w-[280px]'}
          max-h-[100dvh] lg:max-h-[calc(100vh-64px)] overflow-y-auto overflow-x-hidden
          transition-transform duration-300 ease-out
          lg:transition-[width] lg:duration-200 lg:ease-out
          bottom-0 lg:bottom-auto self-start
        `}
      >

      {/* Toggle button only */}
      <div className="shrink-0">
        {collapsed ? (
          <div className="flex flex-col items-center py-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all active:scale-90"
              title="Expand sidebar"
            >
              <SvgChevronRight s={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end px-3 h-10">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all active:scale-90"
              title="Collapse sidebar"
            >
              <SvgX s={14} />
            </button>
          </div>
        )}
      </div>

      {/* Scroll area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pt-1 pb-4 space-y-5 hide-scrollbar">

        {/* Top nav items */}
        <section>
          {!collapsed && (
            <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 mb-2">Menu</div>
          )}
          <div className="space-y-0.5">
            {TOP_NAV.map(({ name, path, icon: iconKey, end }) => {
              const Icon = SVG[iconKey];
              const isHash = path.includes('#');
              const targetPath = path.split('#')[0] || '/';
              const targetHash = path.split('#')[1] ? '#' + path.split('#')[1] : '';

              let isActive = false;
              if (isHash) {
                isActive = location.pathname === targetPath && location.hash === targetHash;
              } else {
                if (end) {
                  isActive = location.pathname === targetPath && !location.hash;
                } else {
                  isActive = location.pathname.startsWith(targetPath);
                }
              }

              return (
                <Link key={name} to={path}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 active:scale-95 group
                    ${collapsed ? 'justify-center' : 'justify-start'}
                    ${isActive
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'text-zinc-500 hover:text-white hover:bg-white/[0.05]'}
                  `}
                  title={collapsed ? name : undefined}
                >
                  {Icon && <Icon s={17} c={isActive ? '#a855f7' : '#71717a'} />}
                  {!collapsed && (
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{name}</span>
                      {name === 'Watchlist' && watchlist > 0 && (
                        <span className="text-[10px] font-bold bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-md">{watchlist}</span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Expandable sections */}
        <section>
          {!collapsed && (
            <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-2 mb-2">Explore</div>
          )}
          <div className="space-y-0.5">
            {EXPANDABLE.map(s => <ExpandSection key={s.key} section={s} collapsed={collapsed} />)}
          </div>
        </section>
      </div>

      {/* Footer area */}
      <div className="px-3 py-3 border-t border-white/[0.06] bg-zinc-950 shrink-0 space-y-2">
        <Link to="/favourites"
          className={`
            flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 hover:text-white border border-white/10 active:scale-95 transition-all
            ${collapsed ? 'justify-center' : 'justify-start'}
          `}
        >
          <SvgBookmark s={16} c="white" />
          {!collapsed && <span className="text-sm font-semibold">Watchlist</span>}
        </Link>
      </div>
    </aside>
    </>
  );
}
