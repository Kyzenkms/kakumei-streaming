import KakumeiLogo from './KyzenLogo';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, X, Film, Tv, Star, TrendingUp, Sparkles, Compass, Zap, LogIn, LogOut, User, Calendar, Globe } from 'lucide-react';
import { searchMedia } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { firebaseReady } from '../lib/firebase';

const LANGUAGES = [
  { key: 'all', label: 'All' },
  { key: 'en', label: 'English' },
  { key: 'hi', label: 'Hindi' },
  { key: 'es', label: 'Spanish' },
  { key: 'fr', label: 'French' },
  { key: 'ja', label: 'Japanese' },
  { key: 'ko', label: 'Korean' },
  { key: 'de', label: 'German' },
  { key: 'pt', label: 'Portuguese' },
  { key: 'it', label: 'Italian' },
];

const NAV_LINKS = [];

const posterUrl = (path, size = 'w92') => {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const cleanText = (text = '') => String(text)
  .replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"');

const languageLabel = (item) => {
  if (!item.isNetMirror || !item.language || item.language === 'original') return null;
  return item.language.charAt(0).toUpperCase() + item.language.slice(1);
};

/** Map a NetMirror item's language field to a 2-letter key */
const langKey = (item) => {
  if (item.isNetMirror && item.language && item.language !== 'original') return item.language.slice(0, 2);
  if (item.original_language) return item.original_language;
  return 'en';
};

const TRENDING_SEARCHES = [
  'Attack on Titan', 'One Piece', 'Naruto', 'Demon Slayer',
  'Jujutsu Kaisen', 'Dragon Ball Z', 'Bleach', 'Death Note',
];

export default function Navbar({ onSearchResults }) {
  const { user, login, logout } = useAuth();
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [open, setOpen]           = useState(false);
  const [searching, setSearching] = useState(false);
  const [scrolled, setScrolled]   = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [langFilter, setLangFilter] = useState('all');
  const [showTrending, setShowTrending] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  /* scroll shadow */
  useEffect(() => {
    const scrollEl = document.querySelector('main');
    const fn = () => setScrolled(scrollEl ? scrollEl.scrollTop > 10 : window.scrollY > 10);
    if (scrollEl) scrollEl.addEventListener('scroll', fn, { passive: true });
    else window.addEventListener('scroll', fn, { passive: true });
    return () => {
      if (scrollEl) scrollEl.removeEventListener('scroll', fn);
      else window.removeEventListener('scroll', fn);
    };
  }, []);

  /* debounced search */
  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setSearching(true);
        const r = await searchMedia(query).catch(() => []);
        setResults(r || []);
        setOpen(true);
        setSearching(false);
      } else {
        setResults([]);
        setOpen(false);
        onSearchResults?.('');
      }
    }, 380);
    return () => clearTimeout(t);
  }, [query, onSearchResults]);

  /* reset language filter when query changes */
  useEffect(() => { setLangFilter('all'); }, [query]);

  /* close on outside click */
  useEffect(() => {
    const fn = (e) => {
      if (!e.target.closest('[data-searchbox]')) {
        setOpen(false);
        setShowTrending(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  /* filter results by selected language */
  const filtered = useMemo(() => {
    if (langFilter === 'all') return results;
    return results.filter(item => langKey(item) === langFilter);
  }, [results, langFilter]);

  const clear = () => { setQuery(''); setResults([]); setOpen(false); setLangFilter('all'); setShowTrending(false); onSearchResults?.(''); };

  const pick = (item) => {
    const isTv = item.media_type === 'tv' || item.isTV;
    const title = item.title || item.name || '';
    const queryStr = new URLSearchParams();
    if (item.isNetMirror) {
      queryStr.set('netmirror', 'true');
    } else if (title) {
      queryStr.set('expectedTitle', title);
    }
    const qs = queryStr.toString();
    const path = `/play/${isTv ? 'tv' : 'movie'}/${item.id}${qs ? `?${qs}` : ''}`;
    navigate(path);
    clear();
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color] duration-200 ${
        scrolled 
          ? 'bg-zinc-950/98 border-b border-white/5 shadow-2xl' 
          : 'bg-zinc-950/80 border-b border-transparent'
      }`}
    >
      <div className="pl-4 sm:pl-6 pr-4 sm:pr-6 lg:pr-8 h-14 sm:h-16 flex items-center gap-3 sm:gap-6 mx-auto lg:ml-0 lg:mr-0">

        {/* Logo - far left corner, above sidebar */}
        <Link to="/" className="hidden lg:flex items-center shrink-0 group relative z-[60]">
          <KakumeiLogo size={36} textClassName="text-lg" />
        </Link>
        {/* Mobile logo (no sidebar overlap) */}
        <Link to="/" className="lg:hidden flex items-center shrink-0 group">
          <KakumeiLogo size={32} textClassName="text-base" />
        </Link>

        {/* Desktop Quick Links */}
        <div className="hidden lg:flex items-center gap-1 ml-4 border-l border-white/5 pl-4">
          <Link to="/discover/movie" className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all flex items-center gap-1.5"><Film size={14}/> Movies</Link>
          <Link to="/discover/tv" className="px-3 py-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all flex items-center gap-1.5"><Tv size={14}/> Shows</Link>
          <Link to="/anime" className="px-3 py-1.5 rounded-lg text-xs font-bold text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all flex items-center gap-1.5"><Sparkles size={14}/> Anime</Link>
          <Link to="/schedule" className="px-3 py-1.5 rounded-lg text-xs font-bold text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all flex items-center gap-1.5"><Calendar size={14}/> Schedule</Link>
        </div>

        {/* Search */}
        <div data-searchbox className={`flex-1 relative ml-auto sm:mx-auto group transition-all duration-200 ${open ? 'max-w-2xl' : 'max-w-[130px] xs:max-w-[180px] sm:max-w-md'}`}>
          <div className="relative">
            {searching
              ? <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                </div>
              : <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-purple-400 transition-colors" />
            }
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && query.trim()) {
                  navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }}
              onFocus={() => { if (results.length) setOpen(true); else setShowTrending(true); }}
              placeholder="Search movies, shows, dubs..."
              className="w-full bg-zinc-900/90 border border-white/10 rounded-2xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/60 focus:bg-zinc-900 shadow-lg shadow-black/10 transition-all"
            />
            {query && (
              <button onClick={clear} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Dropdown — trending (no query) or search results */}
          {showTrending && !query && (
            <div className="fixed left-3 right-3 top-[72px] z-[120] rounded-2xl border border-white/10 bg-zinc-950/98 shadow-2xl backdrop-blur-xl sm:absolute sm:left-0 sm:right-0 sm:top-[calc(100%+10px)] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 mb-3 flex items-center gap-1.5">
                <TrendingUp size={11} className="text-purple-400" /> Trending Searches
              </p>
              <div className="flex flex-wrap gap-2">
                {TRENDING_SEARCHES.map(t => (
                  <button key={t} onClick={() => { setQuery(t); setShowTrending(false); }}
                    className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-400 text-xs font-semibold hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300 transition-all">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search results dropdown */}
          {open && results.length > 0 && (
            <div className="fixed left-3 right-3 top-[72px] z-[120] max-h-[calc(100dvh-140px)] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/98 shadow-2xl shadow-black/60 backdrop-blur-xl hide-scrollbar sm:absolute sm:left-0 sm:right-0 sm:top-[calc(100%+10px)] sm:max-h-[70vh]">
              {/* Header + language filter chips */}
              <div className="sticky top-0 z-10 border-b border-white/5 bg-zinc-950/95 backdrop-blur-xl">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Top matches</span>
                  <span className="text-[10px] font-bold text-purple-400">{filtered.length} results</span>
                </div>
                {/* Language chips — horizontal scroll on mobile */}
                <div className="px-3 pb-1 text-[9px] font-black uppercase tracking-[0.16em] text-zinc-600 flex items-center gap-1.5">
                  <Globe size={11} className="text-purple-400 shrink-0" />
                  Languages
                </div>
                <div className="flex items-center gap-1.5 px-3 pb-2.5 overflow-x-auto hide-scrollbar">
                  {LANGUAGES.map(l => (
                    <button key={l.key} onClick={() => setLangFilter(l.key)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all border ${
                        langFilter === l.key
                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                          : 'bg-white/[0.03] border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >{l.label}</button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-zinc-500">No results for this language</p>
                  <button onClick={() => setLangFilter('all')} className="mt-2 text-[11px] text-purple-400 font-bold hover:text-purple-300">Show all languages</button>
                </div>
              )}

              {filtered.slice(0, 10).map(item => {
                const lang = languageLabel(item);
                const title = cleanText(item.title || item.name || 'Unknown');
                const poster = posterUrl(item.poster_path, 'w92');
                return (
                  <button key={`${item.id}-${item.language || 'tmdb'}`} onClick={() => pick(item)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.06] border-b border-white/[0.03] last:border-b-0"
                  >
                    <div className="w-11 h-16 rounded-lg overflow-hidden bg-zinc-900 border border-white/5 shrink-0">
                      {poster
                        ? <img src={poster} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Film size={15} color="#52525b" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[13px] font-bold text-zinc-100 truncate">{title}</p>
                        {lang && <span className="shrink-0 rounded-md bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-purple-300 border border-purple-500/20">{lang}</span>}
                      </div>
                      <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                        {item.media_type === 'tv' ? <Tv size={10}/> : <Film size={10}/>} {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
                        <span>·</span>
                        <span>{(item.release_date || item.first_air_date || '').slice(0, 4) || 'N/A'}</span>
                      </p>
                    </div>
                    {item.vote_average > 0 && (
                      <span className="shrink-0 flex items-center gap-1 rounded-lg bg-amber-400/10 px-1.5 py-1 text-[10px] font-black text-amber-400">
                        <Star size={10} fill="currentColor" /> {item.vote_average.toFixed(1)}
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length > 10 && (
                <button onClick={() => { navigate(`/search?q=${encodeURIComponent(query.trim())}`); setOpen(false); }}
                  className="w-full border-t border-white/10 bg-purple-500/10 px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-purple-300 hover:bg-purple-500/15 transition-colors">
                  See all {filtered.length} results
                </button>
              )}
            </div>
          )}
        </div>

        {/* Auth Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {firebaseReady && user ? (
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowProfile(!showProfile)}
                style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {user.photoURL ? <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%' }} /> : <User size={18} color="#a1a1aa" />}
              </button>
              
              {showProfile && (
                <div className="glass animate-fadeUp" style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 200, borderRadius: 16, padding: '8px', zIndex: 100 }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#f1f1f3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.displayName}</p>
                    <p style={{ fontSize: 11, color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</p>
                  </div>
                  <button 
                    onClick={() => { logout(); setShowProfile(false); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : firebaseReady ? (
            <button
              onClick={login}
              className="btn btn-primary"
              style={{ padding: '8px 16px', borderRadius: 12, fontSize: 13, gap: 8 }}
            >
              <LogIn size={15} /> <span className="hidden sm:inline">Sign In</span>
            </button>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', flexShrink: 0 }} className="hidden lg:flex">
            <div className="animate-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#6ee7b7' }}>Live</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
