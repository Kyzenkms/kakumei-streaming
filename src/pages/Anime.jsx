import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Sparkles, ChevronLeft, ChevronRight, Star, Calendar, Clock, Tv, PlayCircle, Zap, Compass, Laugh, Clapperboard, Wand2, Ghost, Search, Brain, Heart, Rocket, Coffee, Dumbbell, Crosshair } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { MediaCard } from '../components/MediaGrid';
import { fetchAnilistTrending, fetchAnilistOngoing } from '../services/anilist';

const TOPICS = [
  { key: 'action',        name: 'Action',          accent: '#ef4444', icon: Zap },
  { key: 'adventure',     name: 'Adventure',       accent: '#f59e0b', icon: Compass },
  { key: 'comedy',        name: 'Comedy',          accent: '#eab308', icon: Laugh },
  { key: 'drama',         name: 'Drama',           accent: '#3b82f6', icon: Clapperboard },
  { key: 'fantasy',       name: 'Fantasy',         accent: '#a855f7', icon: Wand2 },
  { key: 'horror',        name: 'Horror',          accent: '#dc2626', icon: Ghost },
  { key: 'mystery',       name: 'Mystery',         accent: '#6366f1', icon: Search },
  { key: 'psychological', name: 'Psychological',   accent: '#8b5cf6', icon: Brain },
  { key: 'romance',       name: 'Romance',         accent: '#f43f5e', icon: Heart },
  { key: 'scifi',         name: 'Sci-Fi',          accent: '#0ea5e9', icon: Rocket },
  { key: 'slice-of-life', name: 'Slice of Life',   accent: '#84cc16', icon: Coffee },
  { key: 'sports',        name: 'Sports',          accent: '#22c55e', icon: Dumbbell },
  { key: 'supernatural',  name: 'Supernatural',    accent: '#c084fc', icon: Sparkles },
  { key: 'thriller',      name: 'Thriller',        accent: '#475569', icon: Crosshair },
];

const GENRE_MAP = {
  action: 'Action', adventure: 'Adventure', comedy: 'Comedy', drama: 'Drama',
  fantasy: 'Fantasy', horror: 'Horror', mystery: 'Mystery', psychological: 'Psychological',
  romance: 'Romance', 'scifi': 'Sci-Fi', 'slice-of-life': 'Slice of Life',
  sports: 'Sports', supernatural: 'Supernatural', thriller: 'Thriller',
};

/* ── Topic row with always-visible clickable scroll buttons ── */
function TopicRow({ title, accent, icon: Icon, items, loading, link }) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  const checkArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkArrows();
    el.addEventListener('scroll', checkArrows, { passive: true });
    const ro = new ResizeObserver(checkArrows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkArrows); ro.disconnect(); };
  }, [items, checkArrows]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.7 : el.clientWidth * 0.7, behavior: 'smooth' });
  };

  // Once loading is done, an empty topic must not leave a bare heading + margin.
  if (!loading && (!items || items.length === 0)) return null;

  return (
    <section className="mb-8 sm:mb-10">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}18` }}>
            {Icon && <Icon size={14} style={{ color: accent }} />}
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white m-0 tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {canLeft && (
            <button onClick={() => scroll('left')}
              className="w-9 h-9 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-white hover:bg-zinc-800 active:scale-90 transition-all cursor-pointer" title="Scroll left">
              <ChevronLeft size={18} />
            </button>
          )}
          {canRight && (
            <button onClick={() => scroll('right')}
              className="w-9 h-9 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-white hover:bg-zinc-800 active:scale-90 transition-all cursor-pointer" title="Scroll right">
              <ChevronRight size={18} />
            </button>
          )}
          {link && (
            <Link to={link} className="flex items-center gap-0.5 text-[11px] sm:text-xs text-zinc-500 hover:text-orange-400 transition-colors font-semibold ml-1">
              See all <ChevronRight size={13} />
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="scroll-row hide-scrollbar" style={{ gap: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-[110px] sm:w-[140px] md:w-[160px] shrink-0">
              <div className="skeleton" style={{ paddingTop: '150%', borderRadius: 12 }} />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="relative group/row">
          <div ref={scrollRef} className="scroll-row hide-scrollbar" style={{ gap: 16, paddingBottom: 8 }}>
            {items.map((item, i) => (
              <div key={`${item.id}-${i}`} className="w-[110px] sm:w-[140px] md:w-[160px] shrink-0">
                <MediaCard item={item} showAnimeTags />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function Anime() {
  const [trending, setTrending] = useState([]);
  const [airing, setAiring] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [byTopic, setByTopic] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const PER = 18;

    // Critical rows first: trending + airing (hero content)
    Promise.all([
      fetchAnilistTrending(1, PER),
      fetchAnilistOngoing(1, PER),
    ]).then(([t, a]) => {
      if (!alive) return;
      setTrending(t || []);
      setAiring(a || []);
      setTopRated((t || []).slice().sort((x, y) => (y.vote_average || 0) - (x.vote_average || 0)).slice(0, PER));
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });

    // All topic rows in parallel (non-blocking)
    const topicPromises = TOPICS.map(async (topic) => {
      try {
        const data = await fetchAnilistTrending(1, PER, GENRE_MAP[topic.key]);
        return [topic.key, data || []];
      } catch {
        return [topic.key, []];
      }
    });

    Promise.all(topicPromises).then(entries => {
      if (!alive) return;
      const obj = Object.fromEntries(entries);
      setByTopic(obj);
    }).catch(() => {});

    return () => { alive = false; };
  }, []);

  const hero = trending[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14 sm:pt-16">
      <Navbar />

      <div className="px-4 sm:px-6 lg:px-8 py-6 pb-16 max-w-[1600px] mx-auto">

        {/* Hero banner */}
        {hero && (
          <div className="relative rounded-2xl overflow-hidden mb-8 border border-white/10 min-h-[220px] sm:min-h-[260px]">
            {hero.backdrop_path && (
              <img src={hero.backdrop_path} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" loading="eager" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
            <div className="relative z-10 flex flex-col justify-end h-full p-5 sm:p-8">
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-400 border border-orange-500/25">
                  <Flame size={10} /> Trending Anime
                </span>
                {(hero.status === 'RELEASING' || hero.status === 'releasing') && (
                  <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-400 border border-red-500/25">
                    <Clock size={10} /> Airing
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight leading-tight font-display mb-2">{hero.title || hero.name}</h1>
              <div className="flex flex-wrap items-center gap-3 text-[11px] sm:text-xs text-zinc-400 font-semibold mb-3">
                {hero.release_date && (
                  <span className="flex items-center gap-1.5"><Calendar size={12} className="text-orange-400" /> {hero.release_date.slice(0, 4)}</span>
                )}
                {hero.vote_average > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20"><Star size={12} fill="currentColor" /> {hero.vote_average.toFixed(1)}</span>
                )}
                {hero.episodes > 0 && (
                  <span className="flex items-center gap-1.5"><Tv size={12} className="text-zinc-500" /> {hero.episodes} eps</span>
                )}
              </div>
              <div className="flex gap-2.5">
                <Link to={`/play/tv/${hero.id}?netmirror=true&expectedTitle=${encodeURIComponent(hero.title || hero.name || '')}`}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-zinc-950 font-bold text-xs sm:text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10">
                  <PlayCircle size={14} /> Watch Now
                </Link>
                <Link to={`/details/tv/${hero.id}?title=${encodeURIComponent(hero.title || hero.name || '')}`}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-zinc-800 transition-all active:scale-95">
                  <Sparkles size={14} /> Details
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Trending row */}
        <TopicRow title="Trending Now" accent="#fb923c" icon={Flame} items={trending} loading={loading} link="/discover/anime?provider=anilist&sort=trending" />

        {/* Airing now */}
        <TopicRow title="Currently Airing" accent="#ef4444" icon={Tv} items={airing} loading={loading} link="/discover/anime?provider=anilist&status=releasing" />

        {/* Top rated */}
        <TopicRow title="Top Rated" accent="#fbbf24" icon={Star} items={topRated} loading={loading} link="/discover/anime?provider=anilist&sort=rating" />

        {/* Topic rows */}
        {TOPICS.map(topic => (
          <TopicRow key={topic.key} title={`${topic.name} Anime`} accent={topic.accent} icon={topic.icon}
            items={byTopic[topic.key] || []} loading={loading}
            link={`/discover/anime?provider=anilist&genre=${encodeURIComponent(GENRE_MAP[topic.key])}`} />
        ))}

        {!loading && (trending.length === 0) && (
          <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center">
            <div className="text-zinc-700"><PlayCircle size={56} strokeWidth={1.2} /></div>
            <h3 className="text-lg font-semibold text-white">Couldn't load anime</h3>
            <p className="text-sm text-zinc-500">AniList may be unavailable right now. Try again in a moment.</p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
