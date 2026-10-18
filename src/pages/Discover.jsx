import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { Film, Tv, Sparkles, TrendingUp, Star, Shield, Filter, X, SlidersHorizontal, ArrowUpDown, PlayCircle, ChevronLeft } from 'lucide-react';
import { fetchDiscover, fetchAdultContent, fetchAdultLanguages, fetchDiscoverByLang } from '../services/api';
import { fetchAnilistTrending, fetchAnilistOngoing } from '../services/anilist';
import { attachAdultScripts, triggerAdultAd } from '../services/adManager';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MediaGrid, { MediaGridSkeleton, MediaCard } from '../components/MediaGrid';
import SyncButton from '../components/SyncButton';

const CATS = {
  movie:      { title: 'Movies',    sub: 'Latest feature films', icon: Film,       accent: '#a855f7', type: 'movie' },
  tv:         { title: 'TV Shows',  sub: 'Binge-worthy series',  icon: Tv,         accent: '#38bdf8', type: 'tv' },
  anime:      { title: 'Anime',     sub: 'Stylized animation',   icon: Sparkles,   accent: '#fb923c', type: 'tv', cat: 'anime' },
  popular:    { title: 'Popular',   sub: 'Trending globally',    icon: TrendingUp, accent: '#34d399', type: 'movie', cat: 'popular' },
  'top-rated':{ title: 'Top Rated', sub: 'Critics\' picks',      icon: Star,       accent: '#fbbf24', type: 'movie', cat: 'top_rated' },
  adult:      { title: '18+',       sub: 'Mature audiences only', icon: Shield,    accent: '#ef4444', type: 'movie', cat: 'adult' },
};

const YEARS = ['', '2026','2025','2024','2023','2022','2021-2020','2015-2019','Before 2015'];
const RATINGS = [{ l: 'All', v: '' },{ l: '9+', v: '9' },{ l: '8+', v: '8' },{ l: '7+', v: '7' },{ l: '6+', v: '6' }];
const SORTS = [
  { l: 'Most Popular', v: '' },
  { l: 'Highest Rated', v: 'rating' },
  { l: 'Newest First', v: 'newest' },
  { l: 'Oldest First', v: 'oldest' },
  { l: 'A → Z', v: 'az' },
];

const TMDB_GENRES = [
  { id: '28',    name: 'Action' },
  { id: '35',    name: 'Comedy' },
  { id: '18',    name: 'Drama' },
  { id: '14',    name: 'Fantasy' },
  { id: '27',    name: 'Horror' },
  { id: '10749', name: 'Romance' },
  { id: '878',   name: 'Sci-Fi' },
  { id: '53',    name: 'Thriller' },
];

const ANILIST_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
];

export default function Discover() {
  const { category = 'movie' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const meta = CATS[category] ?? CATS.movie;
  const Icon = meta.icon;

  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [adultLangs,  setAdultLangs]  = useState([]);
  const [adultLangFilter, setAdultLangFilter] = useState('');
  
  const langFilter = searchParams.get('lang') || '';

  const LANGUAGES = [
    { code: 'hindi', label: 'Hindi', emoji: '🇮🇳' },
    { code: 'english', label: 'English', emoji: '🇺🇸' },
    { code: 'tamil', label: 'Tamil', emoji: '🇮🇳' },
    { code: 'telugu', label: 'Telugu', emoji: '🇮🇳' },
    { code: 'korean', label: 'Korean', emoji: '🇰🇷' },
    { code: 'japanese', label: 'Japanese', emoji: '🇯🇵' },
    { code: 'spanish', label: 'Spanish', emoji: '🇪🇸' },
    { code: 'french', label: 'French', emoji: '🇫🇷' },
  ];

  // URL synced filters
  const yearFilter = searchParams.get('year') || '';
  const ratingFilter = searchParams.get('rating') || '';
  const sortFilter = searchParams.get('sort') || '';
  
  // Other URL params that should trigger a re-fetch
  const statusParam = searchParams.get('status');
  const genreParam = searchParams.get('genre');
  const sortParam = searchParams.get('sort');
  const catParam = searchParams.get('cat');

  // Fetch adult languages on mount
  useEffect(() => {
    if (category === 'adult') fetchAdultLanguages().then(setAdultLangs).catch(() => {});
  }, [category]);

  useEffect(() => {
    setLoading(true);
    setItems([]);
    
    const queryParams = Object.fromEntries([...searchParams]);
    
    if (category === 'adult') {
      // Fetch all adult content, then filter on frontend
      fetchAdultContent().then(d => {
        setItems(d || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else if (langFilter && (meta.type === 'movie' || meta.type === 'tv')) {
      // Language filter active: use NetMirror search directly (guaranteed sources)
      fetchDiscoverByLang(langFilter, meta.type)
        .then(d => { setItems(d || []); setLoading(false); })
        .catch(() => setLoading(false));
    } else if (queryParams.provider === 'anilist') {
      const promise = queryParams.status === 'releasing' 
        ? fetchAnilistOngoing(1, 40, queryParams.genre)
        : fetchAnilistTrending(1, 40, queryParams.genre);
        
      promise.then(d => {
        setItems(d || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      fetchDiscover(meta.type, meta.cat || 'trending', queryParams)
        .then(d => { 
          setItems(d || []); 
          setLoading(false); 
        })
        .catch(() => setLoading(false));
    }
      
  }, [category, searchParams, meta, langFilter]);

  const filtered = useMemo(() => {
    let r = [...items];

    // Frontend language filter for adult content
    if (category === 'adult' && adultLangFilter) {
      r = r.filter(item => item.language === adultLangFilter);
    }

    if (yearFilter) {
      r = r.filter(item => {
        const d = (item.release_date || item.first_air_date || '');
        if (yearFilter === '2021-2020') return d >= '2020' && d < '2022';
        if (yearFilter === '2015-2019') return d >= '2015' && d < '2020';
        if (yearFilter === 'Before 2015') return d < '2015';
        return d.startsWith(yearFilter);
      });
    }

    if (ratingFilter) r = r.filter(i => (i.vote_average || 0) >= parseFloat(ratingFilter));

    if (sortFilter === 'rating')  r.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    if (sortFilter === 'newest')  r.sort((a, b) => ((b.release_date || b.first_air_date || '') > (a.release_date || a.first_air_date || '') ? 1 : -1));
    if (sortFilter === 'oldest')  r.sort((a, b) => ((a.release_date || a.first_air_date || '') > (b.release_date || b.first_air_date || '') ? 1 : -1));
    if (sortFilter === 'az')      r.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));

    return r;
  }, [items, yearFilter, ratingFilter, sortFilter, category, adultLangFilter]);

  const groupedMedia = useMemo(() => {
    // Disable row grouping if user has explicitly set filters
    if (searchParams.get('genre') || yearFilter || ratingFilter || sortFilter) return null;

    const groups = {};
    filtered.forEach(item => {
      // Anilist uses item.genres = [{name: 'Action'}], TMDB uses item.genre_ids = [28]
      const itemGenres = item.genres || (item.genre_ids ? item.genre_ids.map(id => {
         const t = TMDB_GENRES.find(g => String(g.id) === String(id));
         return t ? { name: t.name } : null;
      }).filter(Boolean) : []);

      if (!itemGenres || itemGenres.length === 0) return;
      
      itemGenres.forEach(g => {
        const gName = g.name;
        if (!groups[gName]) groups[gName] = [];
        // prevent duplicate items in same row
        if (!groups[gName].some(i => i.id === item.id)) {
          groups[gName].push(item);
        }
      });
    });
    
    const result = Object.entries(groups)
      .sort((a,b) => b[1].length - a[1].length)
      .filter(g => g[1].length >= 2); // Show row if it has at least 2 items

    return result.length > 0 ? result : null;
  }, [filtered, searchParams, yearFilter, ratingFilter, sortFilter]);

  const updateFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) newParams.set(key, value);
    else newParams.delete(key);
    setSearchParams(newParams);
  };

  const hasFilters = yearFilter || ratingFilter || sortFilter || statusParam || genreParam || langFilter;
  const clearAll = () => { 
    setSearchParams(new URLSearchParams()); 
  };

  return (
    <div 
      className="min-h-screen bg-zinc-950 pt-14 sm:pt-16"
      onClickCapture={(e) => {
        if (category === 'adult' && (e.target.closest('a') || e.target.closest('button'))) {
          triggerAdultAd();
        }
      }}
    >
      <Navbar />

      <div className="px-4 sm:px-6 lg:px-8 py-6 pb-16 max-w-[1600px] mx-auto">

        {/* Header banner */}
        <div className="relative rounded-2xl px-5 py-5 sm:px-8 sm:py-6 mb-6 overflow-hidden border"
          style={{ background: `linear-gradient(135deg, ${meta.accent}12 0%, transparent 55%)`, borderColor: `${meta.accent}20` }}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border"
              style={{ background: `${meta.accent}18`, borderColor: `${meta.accent}25` }}>
              <Icon size={22} style={{ color: meta.accent }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display leading-tight">
                {statusParam === 'ongoing' ? 'Ongoing ' : ''}{genreParam ? 'Genre: ' : ''}{meta.title}
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">{meta.sub}{!loading && !(category === 'adult' && !adultLangFilter) && ` · ${filtered.length} titles`}</p>
            </div>
            {(category === 'anime' || catParam === 'anime') && (
              <div className="ml-auto flex gap-2 shrink-0">
                <SyncButton type="anilist" />
                <SyncButton type="mal" />
              </div>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 flex-wrap mb-5">
          {Object.entries(CATS).filter(([key]) => key !== 'anime').map(([key, c]) => {
            const CIcon = c.icon;
            const active = key === category;
            return (
              <NavLink key={key} to={`/discover/${key}`}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium no-underline transition-all duration-150 ${
                  active
                    ? 'bg-white text-zinc-950'
                    : 'bg-white/5 text-zinc-400 border border-white/[0.08] hover:text-white hover:bg-white/10'
                }`}>
                <CIcon size={13} /> {c.title}
              </NavLink>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <button onClick={() => setFiltersVisible(!filtersVisible)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-[13px] font-medium transition-all cursor-pointer ${
              filtersVisible || hasFilters
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                : 'bg-white/5 border-white/[0.08] text-zinc-400 hover:text-white'
            }`}>
            <SlidersHorizontal size={14} /> Filters
            {[yearFilter,ratingFilter,sortFilter,statusParam,genreParam,langFilter].filter(Boolean).length > 0 && <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{[yearFilter,ratingFilter,sortFilter,statusParam,genreParam,langFilter].filter(Boolean).length}</span>}
          </button>

          {hasFilters && (
            <button onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 cursor-pointer text-xs font-medium transition-all hover:bg-red-500/20">
              <X size={13} /> Clear
            </button>
          )}

          <span className="ml-auto text-xs text-zinc-600">
            {loading ? 'Loading…' : `${filtered.length} results`}
          </span>
        </div>

        {/* Filter panels */}
        {filtersVisible && (
          <div className="animate-fadeUp grid grid-cols-1 sm:grid-cols-3 gap-5 p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] mb-5">
            {/* Year */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2.5">Year</label>
              <div className="flex flex-wrap gap-1.5">
                {YEARS.map(y => (
                  <button key={y || 'all'} onClick={() => updateFilter('year', y)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      yearFilter === y ? 'bg-purple-500 border-purple-500 text-white' : 'bg-transparent border-white/10 text-zinc-500 hover:text-white hover:border-white/20'
                    }`}>{y || 'All'}</button>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2.5">Min Rating</label>
              <div className="flex flex-wrap gap-1.5">
                {RATINGS.map(r => (
                  <button key={r.v} onClick={() => updateFilter('rating', r.v)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      ratingFilter === r.v ? 'bg-amber-400 border-amber-400 text-zinc-950' : 'bg-transparent border-white/10 text-zinc-500 hover:text-white hover:border-white/20'
                    }`}>{r.l}</button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2.5">Sort By</label>
              <div className="flex flex-wrap gap-1.5">
                {SORTS.map(s => (
                  <button key={s.v} onClick={() => updateFilter('sort', s.v)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      sortFilter === s.v ? 'bg-sky-400 border-sky-400 text-zinc-950' : 'bg-transparent border-white/10 text-zinc-500 hover:text-white hover:border-white/20'
                    }`}>{s.l}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Language filter buttons (non-adult) ── */}
        {category !== 'adult' && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => updateFilter('lang', '')}
              className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all border ${
                !langFilter
                  ? 'bg-purple-500 text-white border-purple-500'
                  : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >All</button>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => updateFilter('lang', l.code)}
                className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all border ${
                  langFilter === l.code
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                }`}
              >
                {l.emoji} {l.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Adult: Language filter buttons ── */}
        {category === 'adult' && adultLangs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setAdultLangFilter('')}
              className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all border ${
                !adultLangFilter
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
              }`}
            >All</button>
            {adultLangs.map(lang => {
              const langEmoji = { hindi: '🇮🇳', english: '🇺🇸', bhojpuri: '🇮🇳', tamil: '🇮🇳', telugu: '🇮🇳', malayalam: '🇮🇳', kannada: '🇮🇳', punjabi: '🇮🇳', marathi: '🇮🇳', bengali: '🇮🇳', gujarati: '🇮🇳', odia: '🇮🇳', arabic: '🇸🇦', indonesian: '🇮🇩' };
              return (
                <button
                  key={lang}
                  onClick={() => setAdultLangFilter(lang)}
                  className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all border ${
                    adultLangFilter === lang
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                  }`}
                >
                  {langEmoji[lang] || '🌍'} <span className="capitalize">{lang}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <MediaGridSkeleton count={18} />
        ) : filtered.length > 0 ? (
          <div className="animate-fadeUp">
            {groupedMedia ? (
              <div className="flex flex-col gap-8">
                {groupedMedia.map(([genreName, items]) => (
                  <div key={genreName}>
                    <h2 className="text-base font-semibold text-white mb-3 tracking-tight">{genreName}</h2>
                    <div className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar">
                      {items.map(item => (
                        <div key={item.id} className="w-[130px] shrink-0 sm:w-[150px] md:w-[165px]">
                          <MediaCard item={item} type={item.isTV ? 'tv' : 'movie'} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <MediaGrid items={filtered} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center">
            <div className="text-zinc-700">
              <PlayCircle size={56} strokeWidth={1.2} />
            </div>
            <h3 className="text-lg font-semibold text-white">No results found</h3>
            <p className="text-sm text-zinc-500">Try changing the language filter.</p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
