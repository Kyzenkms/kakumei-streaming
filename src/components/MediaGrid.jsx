import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, Play, Film, Tv, Sparkles, Bookmark, BookmarkCheck, Info, ChevronRight, Heart } from 'lucide-react';

const IMG = (p) => {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return `https://image.tmdb.org/t/p/w342${p}`;
};

const GENRE_MAP = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
  99:'Documentary', 18:'Drama', 10751:'Family', 14:'Fantasy', 36:'History',
  27:'Horror', 10402:'Music', 9648:'Mystery', 10749:'Romance', 878:'Sci-Fi',
  53:'Thriller', 10752:'War', 37:'Western',
};
const GENRE_COLOR = {
  28:'#ef4444', 12:'#f59e0b', 16:'#8b5cf6', 35:'#eab308', 80:'#6b7280',
  99:'#06b6d4', 18:'#3b82f6', 10751:'#22c55e', 14:'#a855f7', 36:'#78716c',
  27:'#dc2626', 10402:'#ec4899', 9648:'#6366f1', 10749:'#f43f5e', 878:'#0ea5e9',
  53:'#475569', 10752:'#65a30d', 37:'#d97706',
};

/* ── Anime status tags ── */
function AnimeTag({ item }) {
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const isNew = year >= '2025';
  const isOngoing = item.isTV && item.status !== 'Ended' && item.status !== 'Canceled';
  if (!isNew && !isOngoing) return null;
  return (
    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {isOngoing && (
        <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.85)', color: '#fff', letterSpacing: '0.06em' }}>● LIVE</span>
      )}
      {isNew && (
        <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(168,85,247,0.85)', color: '#fff', letterSpacing: '0.06em' }}>NEW</span>
      )}
    </div>
  );
}

export default function MediaGrid({ items, showAnimeTags = false, recsMode = false }) {
  if (!items?.length) return null;
  return (
    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9 gap-2.5 sm:gap-4 md:gap-6">
      {items.map((item, i) => (
        <MediaCard key={`${item.id}-${i}`} item={item} showAnimeTags={showAnimeTags} recsMode={recsMode} />
      ))}
    </div>
  );
}

// NetMirror titles arrive HTML-encoded ("A Girl &amp; Her Guard Dog"); decode
// the common entities so cards/links show clean text (& not &amp;).
const decodeHtml = (s) => String(s || '')
  .replace(/&amp;/gi, '&').replace(/&#0?39;/g, "'").replace(/&apos;/gi, "'")
  .replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');

export function MediaCard({ item, showAnimeTags, recsMode = false }) {
  const isTV   = item.isTV || item.media_type === 'tv';
  const title  = decodeHtml(item.title || item.name || 'Unknown');
  const year   = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
  const poster = IMG(item.poster_path);
  const gId    = item.genre_ids?.[0];
  const genre  = GENRE_MAP[gId];
  const genreClr = GENRE_COLOR[gId] || '#71717a';

  const [bookmarked, setBookmarked] = useState(() => localStorage.getItem(`bookmark_${isTV ? 'tv' : 'movie'}_${item.id}`) !== null);
  const [liked, setLiked] = useState(() => localStorage.getItem(`like_${isTV ? 'tv' : 'movie'}_${item.id}`) !== null);

  const toggleBookmark = (e) => {
    e.preventDefault(); e.stopPropagation();
    const next = !bookmarked;
    setBookmarked(next);
    const key = `bookmark_${isTV ? 'tv' : 'movie'}_${item.id}`;
    if (next) {
      localStorage.setItem(key, JSON.stringify({ ...item, isTV, timestamp: Date.now() }));
    } else {
      localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event('storage'));
  };

  const toggleLike = (e) => {
    e.preventDefault(); e.stopPropagation();
    const next = !liked;
    setLiked(next);
    const key = `like_${isTV ? 'tv' : 'movie'}_${item.id}`;
    if (next) {
      localStorage.setItem(key, JSON.stringify({ ...item, isTV, timestamp: Date.now() }));
    } else {
      localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event('storage'));
  };

  const isAnilist = Boolean(item.anilistId);
  // Recommendations carry TMDB ids that never match NetMirror's internal ids.
  // Route them straight to the player via title search (Player.jsx falls back to a
  // NetMirror title lookup), so they resolve to the correct source instead of 404ing.
  const isAdultItem = item.isAdult || item.category === 'adult';
  const linkPath = item.isNetMirror
    ? `/play/${isTV ? 'tv' : 'movie'}/${item.id}?netmirror=true${isAdultItem ? '&adult=true' : ''}`
    : recsMode
      ? `/play/${isTV ? 'tv' : 'movie'}/${item.id}?netmirror=true&expectedTitle=${encodeURIComponent(title)}`
      : `/details/${isTV?'tv':'movie'}/${item.id}${isAnilist ? `?title=${encodeURIComponent(title)}` : ''}`;
  const languageLabel = item.isNetMirror && item.language && item.language !== 'original'
    ? item.language.charAt(0).toUpperCase() + item.language.slice(1)
    : null;

  return (
    <div className="relative group">
      <Link to={linkPath} className="block no-underline rounded-2xl overflow-hidden bg-zinc-900/50 border border-white/5 active:scale-95 transition-transform duration-100 shadow-lg hover:shadow-purple-500/10 hover:border-white/10 hover:transition-colors hover:duration-200">
        {/* Poster */}
        <div className="relative aspect-[2/3] overflow-hidden">
          {poster 
            ? <img src={poster} alt={title} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-800 text-zinc-600">
                {isTV ? <Tv size={28} /> : <Film size={28} />}
                <span className="text-[10px] font-bold uppercase tracking-widest">No Poster</span>
              </div>
          }

          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80" />

          {/* Rating Badge */}
          {rating && (
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-lg text-[10px] font-black text-amber-400">
              <Star size={10} fill="currentColor" /> {rating}
            </div>
          )}

          {/* Action Buttons — persistently visible (dimmed) so touch users can
              see them; brighten on hover. Was opacity-0 → invisible until hover,
              which hid them entirely on phones/tablets. */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={toggleLike}
              className={`p-1.5 rounded-lg backdrop-blur-md transition-all ${liked ? 'bg-red-500 text-white' : 'bg-black/50 text-white/90 hover:bg-black/70'}`}
              title="Favorite"
              aria-label="Favorite"
            >
              <Heart size={14} fill={liked ? "currentColor" : "none"} />
            </button>
            <button 
              onClick={toggleBookmark}
              className={`p-1.5 rounded-lg backdrop-blur-md transition-all ${bookmarked ? 'bg-purple-600 text-white' : 'bg-black/50 text-white/90 hover:bg-black/70'}`}
              title="Watchlist"
              aria-label="Watchlist"
            >
              <Bookmark size={14} fill={bookmarked ? "currentColor" : "none"} />
            </button>
          </div>

          {/* Type / Language Tags */}
          <div className="absolute bottom-2 left-2 hidden sm:flex items-center gap-1 bg-white/10 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white/80 uppercase">
            {isTV ? <Tv size={10} /> : <Film size={10} />} {isTV ? 'Series' : 'Movie'}
          </div>
          {languageLabel && !window.location.pathname.includes('/discover/adult') && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-purple-600/90 backdrop-blur-md px-2 py-0.5 rounded-md text-[9px] font-black text-white uppercase shadow-lg shadow-purple-900/30">
              {languageLabel}
            </div>
          )}

          {showAnimeTags && <AnimeTag item={item} />}
        </div>

        {/* Info */}
        <div className="px-1.5 py-1.5 sm:p-3">
          <h3 className="text-[10px] sm:text-xs font-bold text-white/90 leading-snug mb-1 line-clamp-2 min-h-[2.4em] group-hover:text-purple-400 group-hover:transition-colors group-hover:duration-150" title={title}>
            {title}
          </h3>
          {/* Year · Genre grouped together (was justify-between, which flung
              them to opposite card edges and broke the visual relationship). */}
          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-semibold text-zinc-500">
            <span>{year || 'N/A'}</span>
            {genre && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span className="text-zinc-600 hidden xs:block truncate">{genre}</span>
              </>
            )}
          </div>
          {item._hint && (
            <div className="mt-0.5 text-[9px] sm:text-[10px] font-bold text-purple-300/80 truncate">{item._hint}</div>
          )}
        </div>
      </Link>
    </div>
  );
}

export function MediaGridSkeleton({ count = 12 }) {
  return (
    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9 gap-2.5 sm:gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-zinc-900/50 border border-white/5">
          <div className="skeleton aspect-[2/3]" />
          <div className="p-3">
            <div className="skeleton h-3 w-3/4 mb-2" />
            <div className="skeleton h-2 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}