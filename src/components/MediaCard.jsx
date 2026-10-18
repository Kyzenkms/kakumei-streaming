import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Bookmark, Heart, Star } from 'lucide-react';
import { API_CONFIG } from '../services/api';

function getImg(path, size = 'w342') {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function getYear(item) {
  const d = item.release_date || item.first_air_date || '';
  return d ? d.slice(0, 4) : '';
}

export default function MediaCard({ item, index = 0 }) {
  const isTV = item.isTV || item.media_type === 'tv';
  const type = isTV ? 'tv' : 'movie';
  const id = item.id;
  const title = item.title || item.name || '';
  const poster = getImg(item.poster_path);
  const year = getYear(item);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  const bmKey = `bookmark_${type}_${id}`;
  const likeKey = `like_${type}_${id}`;

  const [bookmarked, setBookmarked] = useState(() => !!localStorage.getItem(bmKey));
  const [liked, setLiked] = useState(() => !!localStorage.getItem(likeKey));
  const [imgErr, setImgErr] = useState(false);

  const toggleBookmark = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (bookmarked) {
      localStorage.removeItem(bmKey);
    } else {
      localStorage.setItem(bmKey, JSON.stringify({ ...item, isTV, timestamp: Date.now() }));
    }
    setBookmarked(b => !b);
    window.dispatchEvent(new Event('storage'));
  }, [bookmarked, bmKey, item, isTV]);

  const toggleLike = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (liked) {
      localStorage.removeItem(likeKey);
    } else {
      localStorage.setItem(likeKey, JSON.stringify({ ...item, isTV, timestamp: Date.now() }));
    }
    setLiked(l => !l);
    window.dispatchEvent(new Event('storage'));
  }, [liked, likeKey, item, isTV]);

  const href = item.isNetMirror
    ? `/play/${type}/${id}?netmirror=true`
    : `/details/${type}/${id}`;

  const delay = Math.min(index * 0.035, 0.4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ scale: 1.04, y: -2 }}
      style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer' }}
    >
      <Link to={href} style={{ display: 'block' }}>
        {/* Poster */}
        <div style={{ aspectRatio: '2/3', background: 'var(--bg-elevated)', position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
          {poster && !imgErr ? (
            <img
              src={poster}
              alt={title}
              loading="lazy"
              onError={() => setImgErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 8 }}>
              {title}
            </div>
          )}

          {/* Rating badge */}
          {rating && parseFloat(rating) > 0 && (
            <div style={{
              position: 'absolute', top: 6, left: 6,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              borderRadius: 6,
              padding: '2px 6px',
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 11, fontWeight: 600, color: '#f59e0b',
            }}>
              <Star size={10} fill="#f59e0b" />
              {rating}
            </div>
          )}

          {/* Hover overlay */}
          <div className="card-overlay" style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
            opacity: 0,
            transition: 'opacity 0.25s',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <motion.div whileHover={{ scale: 1.1 }} style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'rgba(99,102,241,0.9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(99,102,241,0.5)',
            }}>
              <Play size={18} fill="white" style={{ color: 'white', marginLeft: 2 }} />
            </motion.div>
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleBookmark}
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: bookmarked ? 'rgba(99,102,241,0.9)' : 'rgba(0,0,0,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <Bookmark size={13} fill={bookmarked ? 'white' : 'none'} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleLike}
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: liked ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <Heart size={13} fill={liked ? 'white' : 'none'} />
              </motion.button>
            </div>
          </div>

          {/* Progress bar */}
          {item.progress > 0 && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,0.15)' }}>
              <div style={{ height: '100%', width: `${Math.min(item.progress * 100, 100)}%`, background: 'var(--accent)' }} />
            </div>
          )}

          {/* Type badge */}
          {isTV && (
            <div style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(99,102,241,0.8)',
              backdropFilter: 'blur(8px)',
              borderRadius: 4, padding: '1px 5px',
              fontSize: 9, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: 1,
            }}>TV</div>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '6px 2px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {year}
          </div>
        </div>
      </Link>

      <style>{`.card-overlay:hover { opacity: 1 !important; } [class*="card"] > a:hover .card-overlay { opacity: 1 !important; }`}</style>
    </motion.div>
  );
}
