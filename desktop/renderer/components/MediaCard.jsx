import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, BookmarkSimple, Heart } from '@phosphor-icons/react';
import { API_CONFIG } from '@app/services/api';

// A single poster card — consistent 2:3 ratio, one hover motion, no slop.
function MediaCard({ item, onPlay }) {
  const navigate = useNavigate();
  const isTV = item.isTV ?? item.media_type === 'tv';
  const title = item.title || item.name || 'Untitled';
  const poster = item.poster_path
    ? (String(item.poster_path).startsWith('http') ? item.poster_path : `${API_CONFIG.IMG_URL_W500}${item.poster_path}`)
    : null;
  const year = String(item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : null;
  const language = item.language || item.displayLanguage || item._langCode || item.original_language || null;
  const [imgOk, setImgOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Quick actions share Details' storage keys so likes/watchlist stay in sync
  // across cards, details, and the Watchlist screen.
  const storageType = isTV ? 'tv' : 'movie';
  const bmKey = `bookmark_${storageType}_${item.id}`;
  const likeKey = `like_${storageType}_${item.id}`;
  const [saved, setSaved] = useState(() => { try { return localStorage.getItem(bmKey) !== null; } catch { return false; } });
  const [liked, setLiked] = useState(() => { try { return localStorage.getItem(likeKey) !== null; } catch { return false; } });
  const flipSave = (e) => {
    e.stopPropagation();
    try {
      if (saved) localStorage.removeItem(bmKey);
      else localStorage.setItem(bmKey, JSON.stringify({ ...item, isTV, timestamp: Date.now() }));
      setSaved(!saved);
      window.dispatchEvent(new Event('storage'));
    } catch { /* storage unavailable — card still navigates */ }
  };
  const flipLike = (e) => {
    e.stopPropagation();
    try {
      if (liked) localStorage.removeItem(likeKey);
      else localStorage.setItem(likeKey, JSON.stringify({ ...item, isTV, timestamp: Date.now() }));
      setLiked(!liked);
      window.dispatchEvent(new Event('storage'));
    } catch { /* storage unavailable — card still navigates */ }
  };

  const go = () => {
    if (onPlay) return onPlay(item);
    const isAdultItem = item.isAdult || item.category === 'adult';
    // Pass the catalog title through so Watch can label the header, fetch
    // language dubs, and resolve TMDB-backed servers without a blank state.
    if (item.isNetMirror) return navigate(`/play/${isTV ? 'tv' : 'movie'}/${item.id}?netmirror=true&expectedTitle=${encodeURIComponent(title)}${isAdultItem ? '&adult=true' : ''}`);
    if (item.anilistId) return navigate(`/details/${isTV ? 'tv' : 'movie'}/${item.id}?title=${encodeURIComponent(title)}`);
    return navigate(`/details/${isTV ? 'tv' : 'movie'}/${item.id}`);
  };

  return (
    <button
      onClick={go}
      aria-label={`View ${title}`}
      className="group relative w-[150px] shrink-0 text-left kz-focus-ring"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg"
           style={{ background: 'var(--kz-surface-2)', border: '1px solid var(--kz-border)' }}>
        {poster && imgOk ? (
          <>
            {!loaded && <div className="absolute inset-0 kz-skeleton" />}
            <img src={poster} alt={title} loading="lazy" decoding="async"
                 onLoad={() => setLoaded(true)}
                 onError={() => setImgOk(false)}
                 className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
          </>
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[var(--kz-surface-2)] to-[var(--kz-surface-3)] px-3 text-center">
            <span className="kz-display text-sm font-semibold leading-tight" style={{ color: 'var(--kz-text-secondary)' }}>{title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="grid h-11 w-11 place-items-center rounded-full text-white"
                style={{ background: 'var(--kz-play)' }}>
            <Play size={18} weight="fill" />
          </span>
        </div>
        {rating && (
          <span className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white kz-glass">
            ★ {rating}
          </span>
        )}
        {language && (
          <span className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white kz-glass">
            {language}
          </span>
        )}
        {/* Hover quick actions — always shown once active. stopPropagation so
            the card navigation doesn't fire. */}
        <div className={`absolute bottom-2 right-2 flex gap-1.5 transition-opacity duration-200 ${saved || liked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <span role="button" tabIndex={0} aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'} title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
            onClick={flipSave} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipSave(e); } }}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white kz-glass"
            style={saved ? { color: 'var(--kz-accent)' } : undefined}>
            <BookmarkSimple size={15} weight={saved ? 'fill' : 'regular'} />
          </span>
          <span role="button" tabIndex={0} aria-label={liked ? 'Unlike' : 'Like'} title={liked ? 'Unlike' : 'Like'}
            onClick={flipLike} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipLike(e); } }}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white kz-glass"
            style={liked ? { color: '#f87171' } : undefined}>
            <Heart size={15} weight={liked ? 'fill' : 'regular'} />
          </span>
        </div>
      </div>
      <div className="mt-2">
        <p className="truncate text-[13px] font-medium text-[var(--kz-text)]" title={title}>{title}</p>
        <p className="text-[11px]" style={{ color: 'var(--kz-text-muted)' }}>
          {year || (isTV ? 'Series' : 'Movie')}
        </p>
      </div>
    </button>
  );
}

export default memo(MediaCard);
