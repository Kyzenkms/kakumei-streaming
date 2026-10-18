import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Play, Star, ChevronLeft, 
  Plus, Heart, Share2, Users, 
  Sparkles, MessageSquare, Check, X, Globe
} from 'lucide-react';
import { searchMedia, getDetails, getRecommendations } from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MediaGrid from '../components/MediaGrid';
import Comments from '../components/Comments';
import SeoHead, { buildMovieSchema } from '../components/SeoHead';

const TMDB_IMG = (path, size = 'w342') => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

const LANG_ORDER = ['english', 'hindi', 'tamil', 'telugu', 'spanish', 'french', 'german', 'japanese', 'korean', 'portuguese', 'italian', 'chinese', 'arabic', 'turkish', 'russian', 'thai', 'indonesian', 'bengali'];
const LANG_LABELS = { english: 'English', hindi: 'Hindi', spanish: 'Spanish', french: 'French', german: 'German', japanese: 'Japanese', korean: 'Korean', portuguese: 'Portuguese', italian: 'Italian', chinese: 'Chinese', arabic: 'Arabic', turkish: 'Turkish', russian: 'Russian', thai: 'Thai', indonesian: 'Indonesian', bengali: 'Bengali', tamil: 'Tamil', telugu: 'Telugu', original: 'Original' };
const LANG_FLAGS = { english: '🇺🇸', hindi: '🇮🇳', tamil: '🇮🇳', telugu: '🇮🇳', spanish: '🇪🇸', french: '🇫🇷', german: '🇩🇪', japanese: '🇯🇵', korean: '🇰🇷', portuguese: '🇧🇷', italian: '🇮🇹', chinese: '🇨🇳', arabic: '🇸🇦', turkish: '🇹🇷', russian: '🇷🇺', thai: '🇹🇭', indonesian: '🇮🇩', bengali: '🇧🇩', original: '🎬' };

export default function Details() {
  const { type, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [media, setMedia] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);

  const title = media?.title || media?.name || '';
  const cleanId = useMemo(() => (id || '').split('_')[0], [id]);
  const typeIsTV = type === 'tv';

  useEffect(() => {
    window.scrollTo(0, 0);
    let alive = true;
    setLoading(true);
    setExtraLoading(false);
    setMedia(null);
    setRecs([]);
    setLanguages([]);

    const loadData = async (targetId, targetType = type) => {
      try {
        const details = await getDetails(targetId, targetType === 'tv');
        if (!alive) return false;
        if (details && details.id && details.success !== false) {
          setMedia(details);
          const key = `bookmark_${targetType}_${details.id}`;
          const likeKey = `like_${targetType}_${details.id}`;
          setIsBookmarked(localStorage.getItem(key) !== null);
          setIsLiked(localStorage.getItem(likeKey) !== null);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    (async () => {
      const queryTitle = searchParams.get('title');
      let success = false;

      // If a title hint is present, the URL id is likely an AniList id (not a TMDB id).
      // Resolve the real TMDB entry by title search first to avoid loading an unrelated show.
      if (queryTitle) {
        const searchResults = await searchMedia(queryTitle);
        const scored = (searchResults || [])
          .filter(r => !r.isNetMirror && (r.media_type === 'movie' || r.media_type === 'tv'))
          .map(r => {
            const tq = queryTitle.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
            const t = (r.title || r.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
            let score = 0;
            if (tq && t === tq) score += 1000;
            if (tq && t.startsWith(tq)) score += 500;
            if (tq && t.includes(tq)) score += 300;
            if (tq && tq.includes(t)) score += 200;
            if (r.media_type === 'tv') score += 10;
            return { r, score };
          })
          .sort((a, b) => b.score - a.score);
        const match = scored[0]?.r || null;
        if (match) {
          const matchType = match.media_type || type;
          success = await loadData(match.id, matchType);
          if (success) window.history.replaceState(null, '', `/details/${matchType}/${match.id}`);
        }
      }

      if (!success) success = await loadData(cleanId, type);

      if (!success && queryTitle) {
        const searchResults = await searchMedia(queryTitle);
        const match = searchResults.find(r => {
          const t1 = (r.title || r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const t2 = queryTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
          return t1 === t2 || t1.includes(t2) || t2.includes(t1);
        }) || searchResults[0];
        if (match) {
          const matchType = match.media_type || type;
          success = await loadData(match.id, matchType);
          if (success) window.history.replaceState(null, '', `/details/${matchType}/${match.id}`);
        }
      }
      if (!success && alive) setMedia(null);
      if (alive) {
        setLoading(false);
        setExtraLoading(true);
      }
    })();

    return () => { alive = false; };
  }, [cleanId, type, searchParams]);

  useEffect(() => {
    let alive = true;
    if (!media?.id) return;
    (async () => {
      try {
        // Fire recommendations + fast language lookup in parallel
        const [recommendations, fastLangs] = await Promise.allSettled([
          getRecommendations(media.id, typeIsTV),
          title ? fetch(`/api/netmirror/languages?title=${encodeURIComponent(title)}`).then(r => r.json()) : Promise.resolve([]),
        ]);
        if (!alive) return;
        if (recommendations.status === 'fulfilled') setRecs(recommendations.value || []);
        let langList = fastLangs.status === 'fulfilled' ? (fastLangs.value || []) : [];
        if (langList.length > 0) {
          const uniq = [...new Map(langList.map(l => [String(l.language || '').toLowerCase(), l])).values()]
            .sort((a, b) => {
              const ai = LANG_ORDER.indexOf(String(a.language || '').toLowerCase());
              const bi = LANG_ORDER.indexOf(String(b.language || '').toLowerCase());
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
            });
          setLanguages(uniq);
        }
      } finally {
        if (alive) setExtraLoading(false);
      }
    })();
    return () => { alive = false };
  }, [media?.id, typeIsTV, title]);

  const toggleBookmark = () => {
    if (!media) return;
    const key = `bookmark_${type}_${media.id}`;
    const next = !isBookmarked;
    setIsBookmarked(next);
    if (next) localStorage.setItem(key, JSON.stringify({ ...media, isTV: type === 'tv', timestamp: Date.now() }));
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event('storage'));
  };

  const toggleLike = () => {
    if (!media) return;
    const key = `like_${type}_${media.id}`;
    const next = !isLiked;
    setIsLiked(next);
    if (next) localStorage.setItem(key, JSON.stringify({ ...media, isTV: type === 'tv', timestamp: Date.now() }));
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event('storage'));
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950"><div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent" /></div>;
  if (!media) return <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white p-6 text-center"><div className="mb-6 p-4 rounded-full bg-red-500/10 border border-red-500/20"><X size={48} className="text-red-500" /></div><h2 className="text-2xl font-black mb-2">Content Unavailable</h2><p className="text-zinc-500 max-w-xs mb-8">We couldn't find a matching TMDB entry for this item. It might not be available for streaming yet.</p><button onClick={() => navigate(-1)} className="px-8 py-3 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-all">Go Back</button></div>;

  const releaseYear = (media.release_date || media.first_air_date || '').slice(0, 4);
  const runtime = media.runtime ? `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m` : (media.episode_run_time?.[0] ? `${media.episode_run_time[0]}m` : null);
  const rating = media.vote_average?.toFixed(1);
  const backdrop = TMDB_IMG(media.backdrop_path, 'original');
  const poster = TMDB_IMG(media.poster_path, 'w500');
  const genres = media.genres?.map(g => g.name).join(' • ');
  const cast = media.credits?.cast?.slice(0, 8) || [];
  const director = media.credits?.crew?.find(c => c.job === 'Director')?.name;


  return (
    <div className="min-h-screen bg-[#07080f] text-white font-sans selection:bg-purple-500/30 pt-14 sm:pt-16">
      <SeoHead
        title={title}
        description={media?.overview?.substring(0, 160) || `Watch ${title} online free in HD`}
        image={media?.poster_path ? `https://image.tmdb.org/t/p/w780${media.poster_path}` : undefined}
        url={`https://stream.kyzenhub.site/app/play/${type}/${id}`}
        type="video.movie"
        releaseDate={media?.release_date || media?.first_air_date}
        rating={media?.vote_average}
        genre={(media?.genres || []).map(g => g.name).join(', ')}
        structuredData={buildMovieSchema(media, type)}
      />
      <Navbar />

      {/* ── HERO ── */}
      <div className="relative w-full">
        {/* Backdrop */}
        <div className="absolute inset-0 z-0">
          {backdrop ? (
            <img src={backdrop} alt="" loading="lazy" className="h-full w-full object-cover opacity-40" />
          ) : (
            <div className="h-full w-full bg-zinc-900" />
          )}
          {/* Mobile: heavy bottom fade, light top */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#07080f] via-[#07080f]/60 to-[#07080f]/20 sm:via-[#07080f]/70 sm:to-[#07080f]/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07080f]/80 via-transparent to-transparent sm:from-[#07080f]" />
        </div>

        {/* ── Mobile Hero ── */}
        <div className="relative z-10 sm:hidden px-4 pt-6 pb-6">
          {/* Poster + Info row */}
          <div className="flex gap-4 items-start">
            {/* Poster */}
            <div className="shrink-0 w-[110px] rounded-xl overflow-hidden shadow-2xl border border-white/[0.1]">
              {poster && <img src={poster} alt={title} loading="lazy" className="w-full h-auto object-cover" />}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0 space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-purple-500/15 px-2 py-0.5 text-[9px] font-semibold text-purple-400 border border-purple-500/25">
                  {type === 'tv' ? 'TV' : 'Movie'}
                </span>
                {rating > 0 && (
                  <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-400 border border-amber-500/20">
                    <Star size={9} fill="currentColor" /> {rating}
                  </span>
                )}
                {releaseYear && <span className="text-[10px] text-zinc-500">{releaseYear}</span>}
                {runtime && <span className="text-[10px] text-zinc-600">· {runtime}</span>}
              </div>
              <h1 className="text-xl font-black tracking-tight text-white leading-tight font-display line-clamp-2">
                {title}
              </h1>
              {genres && <p className="text-[10px] text-zinc-500 font-medium line-clamp-1">{genres}</p>}
            </div>
          </div>
          {/* Overview */}
          {media.overview && (
            <p className="text-[12px] leading-relaxed text-zinc-400 mt-3 line-clamp-3">
              {media.overview}
            </p>
          )}
          {/* Language chips */}
          {(extraLoading || languages.length > 0) && (
            <div className="mt-3">
              <div className="flex items-center gap-1 mb-1.5">
                <Globe size={11} className="text-purple-400" />
                <p className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">Available Languages</p>
              </div>
              {extraLoading ? (
                <div className="flex flex-wrap gap-1.5">
                  {[70, 55, 80].map(w => (
                    <div key={w} className="skeleton h-6 rounded-lg" style={{ width: w }} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {languages.map((lang) => {
                    const lkey = String(lang.language || '').toLowerCase();
                    const label = LANG_LABELS[lkey] || (lang.language ? lang.language.charAt(0).toUpperCase() + lang.language.slice(1) : '?');
                    return (
                      <button key={lang.id}
                        onClick={() => navigate(`/play/${type}/${lang.id}?netmirror=true`)}
                        className="rounded-full bg-white/[0.08] border border-white/[0.12] px-3 py-1 text-[10px] font-bold text-zinc-200 hover:bg-purple-600 hover:border-transparent hover:text-white active:scale-95 transition-all duration-200">
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => {
              const topId = languages[0]?.id || media.id || id;
              const isNm = Boolean(languages.length > 0 || media.isNetMirror);
              const playUrl = isNm
                ? `/play/${type}/${topId}?netmirror=true`
                : `/play/${type}/${topId}${title ? `?expectedTitle=${encodeURIComponent(title)}` : ''}`;
              navigate(playUrl);
            }} className="flex-1 flex items-center justify-center gap-2 bg-white text-zinc-950 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-100 transition-all shadow-lg shadow-white/5 active:scale-95">
              <Play size={15} fill="currentColor" /> {languages.length > 0 ? 'Watch Now' : 'Play Now'}
            </button>
            <button onClick={toggleBookmark} className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all border active:scale-95 ${isBookmarked ? 'bg-purple-500/15 border-purple-500/40 text-purple-300' : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'}`}>
              {isBookmarked ? <Check size={16} /> : <Plus size={16} />}
            </button>
            <button onClick={toggleLike} className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all border active:scale-95 ${isLiked ? 'bg-red-500/15 border-red-500/35 text-red-400' : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-400'}`}>
              <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button onClick={handleShare} className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-zinc-400 active:scale-95">
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {/* ── Desktop Hero ── */}
        <div className="relative z-10 hidden sm:block px-4 sm:px-6 md:px-10 lg:px-14 pt-10 pb-8 max-w-[90rem] mx-auto">
          <div className="flex flex-col md:flex-row gap-6 lg:gap-10 items-start md:items-end">
            {/* Poster */}
            <div className="shrink-0 w-36 lg:w-56 rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
              {poster && <img src={poster} alt={title} loading="lazy" className="w-full h-auto object-cover" />}
            </div>
            {/* Info */}
            <div className="flex-1 space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-purple-500/15 px-2.5 py-1 text-[10px] font-semibold text-purple-400 border border-purple-500/25">
                  {type === 'tv' ? 'TV Series' : 'Movie'}
                </span>
                {rating > 0 && (
                  <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                    <Star size={11} fill="currentColor" /> {rating}
                  </span>
                )}
                {releaseYear && <span className="text-xs text-zinc-500">{releaseYear}</span>}
                {runtime && <span className="text-xs text-zinc-600">{runtime}</span>}
              </div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-[1.05] font-display">
                {title}
              </h1>
              {genres && <p className="text-xs text-zinc-500 font-medium">{genres}</p>}
              <p className="text-sm leading-relaxed text-zinc-400 max-w-2xl line-clamp-3 md:line-clamp-none">
                {media.overview}
              </p>
              {/* Language buttons */}
              {(extraLoading || languages.length > 0) && (
                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Globe size={13} className="text-purple-400" />
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Watch in your language</p>
                  </div>
                  {extraLoading ? (
                    <div className="flex flex-wrap gap-2">
                      {[80, 65, 90, 60].map(w => (
                        <div key={w} className="skeleton h-8 rounded-xl" style={{ width: w }} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {languages.map((lang) => {
                        const lkey = String(lang.language || '').toLowerCase();
                        const label = LANG_LABELS[lkey] || (lang.language ? lang.language.charAt(0).toUpperCase() + lang.language.slice(1) : '?');
                        return (
                          <button key={lang.id}
                            onClick={() => navigate(`/play/${type}/${lang.id}?netmirror=true`)}
                            className="rounded-full bg-white/[0.08] border border-white/[0.12] px-4 py-1.5 text-xs font-bold text-zinc-200 hover:bg-purple-600 hover:border-transparent hover:text-white hover:shadow-[0_0_14px_rgba(147,51,234,0.35)] transition-all duration-200 active:scale-95">
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button onClick={() => {
                  const topId = languages[0]?.id || media.id || id;
                  const isNm = Boolean(languages.length > 0 || media.isNetMirror);
                  const playUrl = isNm
                    ? `/play/${type}/${topId}?netmirror=true`
                    : `/play/${type}/${topId}${title ? `?expectedTitle=${encodeURIComponent(title)}` : ''}`;
                  navigate(playUrl);
                }} className="flex items-center gap-2 bg-white text-zinc-950 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-zinc-100 transition-all hover:scale-105 shadow-xl shadow-white/5 active:scale-95">
                  <Play size={16} fill="currentColor" /> {languages.length > 0 ? 'Watch Now' : 'Play Now'}
                </button>
                <button onClick={toggleBookmark} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all border active:scale-95 ${isBookmarked ? 'bg-purple-500/15 border-purple-500/40 text-purple-300' : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'}`}>
                  {isBookmarked ? <Check size={16} /> : <Plus size={16} />} {isBookmarked ? 'Saved' : 'Watchlist'}
                </button>
                <button onClick={toggleLike} className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all border active:scale-95 ${isLiked ? 'bg-red-500/15 border-red-500/35 text-red-400' : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-400'}`}>
                  <Heart size={17} fill={isLiked ? "currentColor" : "none"} />
                </button>
                <button onClick={handleShare} className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-zinc-400 active:scale-95">
                  <Share2 size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="px-4 sm:px-6 md:px-10 lg:px-14 pb-10 max-w-[90rem] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">

          {/* Main Column */}
          <div className="lg:col-span-3 space-y-8">

            {/* Cast */}
            {cast.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/[0.06]">
                <Users size={16} className="text-purple-400" />
                <h2 className="text-base font-semibold text-white">Cast</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                {cast.map(person => (
                  <div key={person.id} className="w-[72px] md:w-20 shrink-0 group">
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.06] group-hover:border-purple-500/40 transition-all mb-1.5">
                      {person.profile_path ? (
                        <img src={TMDB_IMG(person.profile_path, 'w185')} alt={person.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800"><Users className="text-zinc-700" size={18} /></div>
                      )}
                    </div>
                    <p className="text-[10px] font-medium text-white truncate">{person.name}</p>
                    <p className="text-[9px] text-zinc-600 truncate">{person.character}</p>
                  </div>
                ))}
              </div>
            </section>
            )}

            {/* Recommendations */}
            {recs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/[0.06]">
                  <Sparkles size={16} className="text-purple-400" />
                  <h2 className="text-base font-semibold text-white">More Like This</h2>
                </div>
                <MediaGrid items={recs.slice(0, 12)} recsMode />
              </section>
            )}

            <div id="comments">
              <Comments mediaId={media.id} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-xl bg-white/[0.03] p-5 border border-white/[0.07] space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Details</h3>

              {director && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Director</p>
                  <p className="text-sm text-white">{director}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Released</p>
                <p className="text-sm text-white">{media.release_date || media.first_air_date || '—'}</p>
              </div>
              {media.original_language && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Language</p>
                <p className="text-sm text-white uppercase">{media.original_language}</p>
              </div>
              )}
              {media.status && (
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">Status</p>
                <p className="text-sm text-emerald-400">{media.status}</p>
              </div>
              )}

              {/* Language buttons in sidebar */}
              {extraLoading && languages.length === 0 && (
                <div className="space-y-2">
                  <div className="skeleton h-3 w-20 rounded" />
                  <div className="flex gap-2">
                    <div className="skeleton h-7 w-16 rounded-lg" />
                    <div className="skeleton h-7 w-20 rounded-lg" />
                    <div className="skeleton h-7 w-14 rounded-lg" />
                  </div>
                </div>
              )}
              {!extraLoading && languages.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Stream In</p>
                  <div className="flex flex-wrap gap-1.5">
                    {languages.map((lang) => {
                      const lkey = String(lang.language || '').toLowerCase();
                      const label = LANG_LABELS[lkey] || (lang.language ? lang.language.charAt(0).toUpperCase() + lang.language.slice(1) : '?');
                      return (
                        <button key={lang.id}
                          onClick={() => navigate(`/play/${type}/${lang.id}?netmirror=true`)}
                          className="rounded-full bg-white/[0.07] px-3 py-1 text-[10px] font-bold text-zinc-300 border border-white/[0.1] hover:bg-purple-600 hover:border-transparent hover:text-white transition-all duration-200 active:scale-95">
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-white/[0.06]">
                <button onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 transition-all text-xs font-medium text-zinc-300 border border-white/[0.06]">
                  <MessageSquare size={13} /> Discuss
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {media.genres?.map(g => (
                <span key={g.id} className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium text-zinc-500 border border-white/[0.06] hover:bg-white/[0.08] cursor-default transition-all">
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Footer />
      {shareToast && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-xl animate-fadeUp">
          Link copied!
        </div>
      )}
    </div>
  );
}
