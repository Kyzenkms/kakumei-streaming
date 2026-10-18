import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Play, Star, Calendar, ChevronRight, X,
  TrendingUp, Film, Tv, Sparkles, Clock, BookmarkCheck,
  Flame, Zap, Info, ChevronLeft, Heart,
} from 'lucide-react';
import { fetchDiscover, searchMedia, API_CONFIG } from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MediaGrid, { MediaGridSkeleton, MediaCard } from '../components/MediaGrid';

const TMDB = (p, s = 'w342') => p ? `https://image.tmdb.org/t/p/${s}${p}` : null;

/* ── Media Row (Horizontal Scroll with arrows) ── */
function MediaRow({ items, loading, showAnimeTags = false }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkArrows();
    el.addEventListener('scroll', checkArrows, { passive: true });
    const ro = new ResizeObserver(checkArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkArrows); ro.disconnect(); };
  }, [items]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  if (loading) return (
    <div className="scroll-row hide-scrollbar" style={{ gap: 16 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="w-[110px] sm:w-[140px] md:w-[170px] shrink-0">
          <div className="skeleton" style={{ paddingTop: '150%', borderRadius: 12 }} />
        </div>
      ))}
    </div>
  );
  if (!items?.length) return null;
  return (
    <div className="relative group/row">
      {/* Left arrow */}
      {canScrollLeft && (
        <button onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-zinc-900/90 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-zinc-800 active:scale-90"
          style={{ marginLeft: -6 }}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {/* Right arrow */}
      {canScrollRight && (
        <button onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-zinc-900/90 border border-white/10 flex items-center justify-center text-white opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-zinc-800 active:scale-90"
          style={{ marginRight: -6 }}
        >
          <ChevronRight size={20} />
        </button>
      )}
      {/* Scroll container */}
      <div ref={scrollRef} className="scroll-row hide-scrollbar" style={{ gap: 16, paddingBottom: 12 }}>
        {items.map((item, i) => (
          <div key={`${item.id}-${i}`} className="w-[110px] sm:w-[140px] md:w-[170px] shrink-0">
            <MediaCard item={item} showAnimeTags={showAnimeTags} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section Heading ── */
function SectionHead({ icon, title, accent, link }) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className="flex items-center gap-2">
        <div style={{ color: accent || '#a855f7', flexShrink: 0 }}>{icon}</div>
        <h2 className="text-sm sm:text-base font-bold text-white m-0 tracking-tight">{title}</h2>
      </div>
      {link && (
        <Link to={link} className="flex items-center gap-0.5 text-[11px] sm:text-xs text-zinc-500 hover:text-purple-400 transition-colors font-semibold">
          See all <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

/* ── Hero Slider ── */
function HeroSlider({ items }) {
  const [idx, setIdx] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    if (!items.length) return;
    // Preload the first hero image
    const first = items[0];
    let preloadLink = null;
    if (first?.backdrop_path) {
      preloadLink = document.createElement('link');
      preloadLink.rel = 'preload';
      preloadLink.as = 'image';
      preloadLink.href = `https://image.tmdb.org/t/p/w1280${first.backdrop_path}`;
      document.head.appendChild(preloadLink);
    }
    timer.current = setInterval(() => setIdx(i => (i + 1) % Math.min(items.length, 8)), 6000);
    return () => {
      clearInterval(timer.current);
      if (preloadLink) document.head.removeChild(preloadLink);
    };
  }, [items]);

  if (!items.length) return (
    <div className="skeleton h-[50vh] sm:h-[460px] rounded-2xl mb-6" />
  );

  const item = items[idx];
  const backdrop = TMDB(item.backdrop_path, 'w1280');
  const year     = (item.release_date || item.first_air_date || '').slice(0, 4);

  return (
    <section className="relative -mx-4 sm:mx-0 mb-6 sm:mb-10 group/hero">
      {/* Ambient glow behind the card */}
      <div
        className="absolute inset-x-4 -bottom-4 h-40 rounded-[3rem] blur-3xl opacity-30 pointer-events-none transition-all duration-1000"
        style={{ background: 'linear-gradient(135deg, #a855f7 0%, #38bdf8 100%)' }}
      />
      <div className="relative h-[50vh] sm:h-[460px] sm:rounded-[2rem] overflow-hidden bg-zinc-900 shadow-2xl">
        {/* Backdrop */}
        {backdrop && (
          <img key={backdrop} src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-55 sm:opacity-45 animate-fadeIn" loading="eager" fetchPriority="high" />
        )}

        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent z-20" />

        {/* Content */}
        <div className="relative z-30 h-full flex flex-col justify-end px-4 sm:px-12 pb-8 sm:pb-12 max-w-[90rem]">
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-2.5 sm:mb-4">
            <span className="badge badge-purple px-2.5 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold">
              <Flame size={10} className="mr-0.5" /> Featured
            </span>
            <span className="badge bg-white/10 text-white/70 border-white/10 px-2.5 py-0.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-bold">
              {item.isTV ? 'TV Series' : 'Movie'}
            </span>
          </div>

          <h1 className="text-[1.5rem] sm:text-[2.2rem] lg:text-[3rem] font-black tracking-tight text-white mb-2 sm:mb-3 leading-[1.1] font-display drop-shadow-2xl">
            {item.title || item.name}
          </h1>

          <div className="flex items-center gap-3 mb-3 sm:mb-5 text-[10px] sm:text-xs text-zinc-400 font-semibold">
            {year && <span className="flex items-center gap-1.5"><Calendar size={12} className="text-purple-400" /> {year}</span>}
            {item.vote_average > 0 && <span className="flex items-center gap-1.5 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20"><Star size={12} fill="currentColor" /> {item.vote_average.toFixed(1)}</span>}
          </div>

          <p className="hidden sm:block line-clamp-2 text-sm text-zinc-400 leading-relaxed mb-5 sm:mb-7 max-w-xl opacity-80">
            {item.overview}
          </p>

          <div className="flex gap-2.5 sm:gap-4">
            <Link to={`/play/${item.isTV ? 'tv' : 'movie'}/${item.id}${item.title || item.name ? `?expectedTitle=${encodeURIComponent(item.title || item.name)}` : ''}`}
              className="flex items-center justify-center gap-2 px-5 py-2.5 sm:px-7 sm:py-3.5 rounded-xl bg-white text-zinc-950 font-bold text-xs sm:text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10"
            >
              <Play size={14} fill="currentColor" className="sm:w-4 sm:h-4" /> Watch Now
            </Link>
            <Link to={`/details/${item.isTV ? 'tv' : 'movie'}/${item.id}`}
              className="flex items-center justify-center gap-2 px-5 py-2.5 sm:px-7 sm:py-3.5 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-zinc-800 transition-all active:scale-95"
            >
              <Info size={14} className="sm:w-4 sm:h-4" /> Details
            </Link>
          </div>
        </div>

        {/* Slide dots — larger visible marks + a padded 24px hit area (the bar
            is drawn with a pseudo child so the tap target is bigger than the
            mark, per Fitts's law). Inactive dots are brighter for discoverability. */}
        <div className="absolute bottom-3 right-4 sm:bottom-6 sm:right-8 z-40 flex items-center gap-1">
          {items.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => { setIdx(i); clearInterval(timer.current); }}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === idx ? 'true' : undefined}
              className="group grid place-items-center h-6 w-6 cursor-pointer"
            >
              <span className={`h-1.5 rounded-full transition-all duration-500 ${i === idx ? 'w-8 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]' : 'w-2.5 bg-white/40 group-hover:bg-white/70'}`} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Continue Watching Card ── */
// Decode HTML entities in NetMirror titles ("A Girl &amp; Her Guard Dog" → &).
const decodeHtml = (s) => String(s || '')
  .replace(/&amp;/gi, '&').replace(/&#0?39;/g, "'").replace(/&apos;/gi, "'")
  .replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');

function ContinueCard({ item }) {
  const pct = item.progress ? Math.min(100, Math.round(item.progress * 100)) : 30;
  const poster = TMDB(item.poster_path, 'w342');
  const [hov, setHov] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const title = decodeHtml(item.title || item.name || '');

  // NetMirror items use NetMirror IDs — route straight to player (Details page only supports TMDB IDs)
  const to = item.isNetMirror
    ? `/play/${item.type || (item.isTV ? 'tv' : 'movie')}/${item.id}?netmirror=true&expectedTitle=${encodeURIComponent(title)}`
    : `/details/${item.type || (item.isTV ? 'tv' : 'movie')}/${item.id}`;

  return (
    <Link to={to}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="block no-underline shrink-0 w-[110px] sm:w-[140px] md:w-[150px]">
      <div className={`relative aspect-[2/3] bg-zinc-900 rounded-2xl overflow-hidden mb-3 border transition-all duration-300 shadow-lg ${hov ? 'border-purple-500/50 scale-[1.03] shadow-purple-500/10' : 'border-white/5 shadow-black/40'}`}>
        {poster && imgOk
          ? <img src={poster} alt={title} onError={() => setImgOk(false)} loading="lazy" className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${hov ? 'scale-110' : 'scale-100'}`} />
          : (
            // Branded fallback (was a blank grey box that looked broken).
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-800 to-zinc-900 p-2 text-center">
              <Play size={22} className="text-purple-400/60" />
              <span className="text-[10px] font-bold text-white/70 line-clamp-3 leading-tight">{title}</span>
            </div>
          )
        }
        <div className={`absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent transition-opacity duration-300 ${hov ? 'opacity-100' : 'opacity-60'}`} />
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${hov ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
            <Play size={16} fill="white" color="white" className="ml-0.5" />
          </div>
        </div>
        {/* Progress bar — thicker + defined track so progress reads at a glance. */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50">
          <div className="h-full bg-gradient-to-r from-purple-500 to-sky-400 shadow-[0_0_8px_rgba(168,85,247,0.6)] transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-[11px] sm:text-xs font-bold text-white line-clamp-2 leading-snug min-h-[2.4em] px-1 mt-1" title={title}>{title}</p>
      <div className="flex items-center gap-1.5 px-1 mt-0.5">
        <Clock size={10} className="text-zinc-500" />
        <p className="text-[9px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{pct}% watched</p>
      </div>
    </Link>
  );
}

/* ── Main Home Component ── */
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
  { id: 10751, name: 'Family' },
  { id: 9648,  name: 'Mystery' },
  { id: 80,    name: 'Crime' },
];

function CategoryChips() {
  return (
    <div className="mb-5 sm:mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-purple-500" />
        <span className="text-xs font-semibold text-zinc-400">Genres</span>
      </div>
      <div className="scroll-row hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 gap-2 sm:gap-3 pb-1">
        {GENRES.map(g => (
          <Link key={g.id} to={`/discover/movie?genre=${g.id}`}
            className="text-[11px] sm:text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-purple-500/10 hover:border-purple-500/30 transition-all active:scale-95 whitespace-nowrap"
          >
            {g.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Lazy section — only renders when scrolled near ── */
function LazySection({ children, threshold = 200 }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShow(true); obs.disconnect(); } },
      { rootMargin: `${threshold}px` }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return <div ref={ref}>{show ? children : null}</div>;
}

export default function Home() {
  const [movies,    setMovies]    = useState([]);
  const [shows,     setShows]     = useState([]);
  const [anime,     setAnime]     = useState([]);
  const [topRated,  setTopRated]  = useState([]);
  const [popularM,  setPopularM]  = useState([]);
  const [popularT,  setPopularT]  = useState([]);
  const [actionM,   setActionM]   = useState([]);
  const [comedyM,   setComedyM]   = useState([]);
  const [horrorM,   setHorrorM]   = useState([]);
  const [scifiM,    setScifiM]    = useState([]);
  const [romanceM,  setRomanceM]  = useState([]);
  const [dramaM,    setDramaM]    = useState([]);
  const [crimeM,    setCrimeM]    = useState([]);
  const [fantasyM,  setFantasyM]  = useState([]);
  const [recentWatch, setRecentWatch] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    // Priority: hero + first 2 rows
    Promise.all([
      fetchDiscover('movie', 'trending'),
      fetchDiscover('tv', 'trending'),
    ]).then(([m, s]) => {
      setMovies(m);
      setShows(s);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Non-critical: everything else loads after
    Promise.allSettled([
      fetchDiscover('anime', 'trending'),
      fetchDiscover('movie', 'top_rated'),
      fetchDiscover('movie', 'popular'),
      fetchDiscover('tv', 'popular'),
      fetchDiscover('movie', 'trending', { genre: 28 }),
      fetchDiscover('movie', 'trending', { genre: 35 }),
      fetchDiscover('movie', 'trending', { genre: 27 }),
      fetchDiscover('movie', 'trending', { genre: 878 }),
      fetchDiscover('movie', 'trending', { genre: 10749 }),
      fetchDiscover('movie', 'trending', { genre: 18 }),
      fetchDiscover('movie', 'trending', { genre: 80 }),
      fetchDiscover('movie', 'trending', { genre: 14 }),
    ]).then(([a, t, pm, pt, am, cm, hm, sfm, rm, dm, crm, fm]) => {
      if (a.status === 'fulfilled')   setAnime(a.value);
      if (t.status === 'fulfilled')   setTopRated(t.value);
      if (pm.status === 'fulfilled')  setPopularM(pm.value);
      if (pt.status === 'fulfilled')  setPopularT(pt.value);
      if (am.status === 'fulfilled')  setActionM(am.value);
      if (cm.status === 'fulfilled')  setComedyM(cm.value);
      if (hm.status === 'fulfilled')  setHorrorM(hm.value);
      if (sfm.status === 'fulfilled') setScifiM(sfm.value);
      if (rm.status === 'fulfilled')  setRomanceM(rm.value);
      if (dm.status === 'fulfilled')  setDramaM(dm.value);
      if (crm.status === 'fulfilled') setCrimeM(crm.value);
      if (fm.status === 'fulfilled')  setFantasyM(fm.value);
    });
  }, []);

  useEffect(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('recent_'));
    const w = keys
      .map(k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
    setRecentWatch(w);
  }, []);

  const handleSearch = async (q) => {
    if (!q) { setSearchResults(null); setSearchQuery(''); return; }
    setSearchQuery(q);
    const r = await searchMedia(q).catch(() => []);
    setSearchResults(r || []);
  };

  const featured = [...movies].slice(0, 8);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar />
      <div style={{ padding: '32px 24px' }}>
        <div className="skeleton" style={{ height: 480, borderRadius: 20, marginBottom: 48 }} />
        <MediaGridSkeleton count={12} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14 sm:pt-16">
      <Navbar onSearchResults={handleSearch} />

      {/* ── SEARCH RESULTS ── */}
      {searchResults ? (
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black text-white mb-1">Search Results</h2>
              <p className="text-sm text-zinc-500">{searchResults.length} results for "{searchQuery}"</p>
            </div>
            <button onClick={() => { setSearchResults(null); setSearchQuery(''); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-all text-sm font-bold">
              <X size={16} /> Clear
            </button>
          </div>
          <MediaGrid items={searchResults} />
        </div>
      ) : (
        <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-6 max-w-[1600px] mx-auto">

          {/* Hero */}
          <HeroSlider items={featured} />

          {/* Categories */}
          <CategoryChips />

          {/* Continue Watching */}
          {recentWatch.length > 0 && (
            <section id="continue" className="mb-6 sm:mb-8">
              <SectionHead icon={<Clock size={16} />} title="Continue Watching" accent="#fbbf24" />
              <div className="scroll-row hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
                {recentWatch.map((item, i) => <ContinueCard key={`${item.id}-${i}`} item={item} />)}
              </div>
            </section>
          )}

          {/* Trending Movies */}
          {(loading || movies.length > 0) && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Film size={16} />} title="Trending Movies" accent="#a855f7" link="/discover/movie" />
            <MediaRow items={movies} loading={loading} />
          </section>
          )}

          {/* Trending TV */}
          {(loading || shows.length > 0) && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Tv size={16} />} title="Trending TV Shows" accent="#38bdf8" link="/discover/tv" />
            <MediaRow items={shows} loading={loading} />
          </section>
          )}

          {/* Trending Anime */}
          {anime.length > 0 && (
          <LazySection>
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Sparkles size={16} />} title="Trending Anime" accent="#fb923c" link="/discover/anime" />
            <MediaRow items={anime} loading={loading} showAnimeTags={true} />
          </section>
          </LazySection>
          )}

          {/* Popular Movies */}
          {popularM.length > 0 && (
          <LazySection>
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Flame size={16} />} title="Popular Movies" accent="#ef4444" link="/discover/popular" />
            <MediaRow items={popularM} loading={loading} />
          </section>
          </LazySection>
          )}

          {/* Action Movies */}
          {actionM.length > 0 && (
          <LazySection>
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Zap size={16} />} title="Action Packed" accent="#f59e0b" link="/discover/movie?genre=28" />
            <MediaRow items={actionM} loading={loading} />
          </section>
          </LazySection>
          )}

          {/* Comedy Movies */}
          {comedyM.length > 0 && (
          <LazySection>
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Sparkles size={16} />} title="Comedy Gold" accent="#eab308" link="/discover/movie?genre=35" />
            <MediaRow items={comedyM} loading={loading} />
          </section>
          </LazySection>
          )}

          {/* Horror Movies */}
          {horrorM.length > 0 && (
          <LazySection>
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Flame size={16} />} title="Horror & Thriller" accent="#dc2626" link="/discover/movie?genre=27" />
            <MediaRow items={horrorM} loading={loading} />
          </section>
          </LazySection>
          )}

          {/* Sci-Fi Movies */}
          {scifiM.length > 0 && (
          <LazySection>
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Sparkles size={16} />} title="Sci-Fi Adventures" accent="#0ea5e9" link="/discover/movie?genre=878" />
            <MediaRow items={scifiM} loading={loading} />
          </section>
          </LazySection>
          )}

          {/* Popular TV Shows */}
          <LazySection>
          {popularT.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Tv size={16} />} title="Popular TV Shows" accent="#38bdf8" link="/discover/tv" />
            <MediaRow items={popularT} loading={loading} />
          </section>
          )}
          </LazySection>

          {/* Romance Movies */}
          <LazySection>
          {romanceM.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Heart size={16} />} title="Romance" accent="#f43f5e" link="/discover/movie?genre=10749" />
            <MediaRow items={romanceM} loading={loading} />
          </section>
          )}
          </LazySection>

          {/* Drama Movies */}
          <LazySection>
          {dramaM.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Film size={16} />} title="Drama" accent="#8b5cf6" link="/discover/movie?genre=18" />
            <MediaRow items={dramaM} loading={loading} />
          </section>
          )}
          </LazySection>

          {/* Crime Movies */}
          <LazySection>
          {crimeM.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Flame size={16} />} title="Crime & Thriller" accent="#64748b" link="/discover/movie?genre=80" />
            <MediaRow items={crimeM} loading={loading} />
          </section>
          )}
          </LazySection>

          {/* Fantasy Movies */}
          <LazySection>
          {fantasyM.length > 0 && (
          <section className="mb-6 sm:mb-8">
            <SectionHead icon={<Sparkles size={16} />} title="Fantasy & Magic" accent="#a78bfa" link="/discover/movie?genre=14" />
            <MediaRow items={fantasyM} loading={loading} />
          </section>
          )}
          </LazySection>

          {/* Top Rated */}
          <LazySection>
          {topRated.length > 0 && (
            <section className="mb-6 sm:mb-8">
              <SectionHead icon={<Star size={16} />} title="Top Rated All-Time" accent="#fbbf24" link="/discover/top-rated" />
              <MediaRow items={topRated} loading={loading} />
            </section>
          )}
          </LazySection>
        </div>
      )}

      <Footer />
    </div>
  );
}