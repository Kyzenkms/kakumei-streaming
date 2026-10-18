import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play, Info, Clock } from '@phosphor-icons/react';
import { fetchDiscover, searchMedia, API_CONFIG } from '@app/services/api';
import { HOME_RAILS } from '../home-rails';
import { loadUiPrefs } from '../ui-prefs';
import Rail from '../components/Rail';

function Hero({ item }) {
  const navigate = useNavigate();
  const [bgLoaded, setBgLoaded] = useState(false);
  if (!item) return <div className="min-h-[56vh] w-full kz-skeleton rounded-none" />;
  const title = item.title || item.name || '';
  const isTV = item.isTV ?? item.media_type === 'tv';
  const backdrop = item.backdrop_path
    ? (String(item.backdrop_path).startsWith('http') ? item.backdrop_path : `${API_CONFIG.BACKDROP_URL}${item.backdrop_path}`)
    : null;
  const overview = item.overview || '';

  return (
    <section className="relative flex min-h-[56vh] flex-col justify-end overflow-hidden">
      <div className="absolute inset-0 z-0" style={{
        background: 'radial-gradient(120% 90% at 85% 10%, var(--kz-accent-soft) 0%, transparent 55%), linear-gradient(135deg, var(--kz-surface-1), var(--kz-bg) 70%)',
      }} />
      {backdrop && (
        <img src={backdrop} alt="" onLoad={() => setBgLoaded(true)}
             className={`absolute inset-0 z-[1] h-full w-full object-cover transition-opacity duration-700 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`} />
      )}
      <div className="absolute inset-0 z-[2]" style={{
        background: 'linear-gradient(to top, #000 6%, rgba(0,0,0,0.2) 55%, transparent 100%), linear-gradient(to right, rgba(0,0,0,0.75), transparent 65%)',
      }} />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[3] px-10 pb-10">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px w-8" style={{ background: 'var(--kz-accent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--kz-text-secondary)' }}>
            Featured {isTV ? 'Series' : 'Film'}
          </span>
        </div>
        <h1 className="kz-display max-w-3xl text-[44px] font-bold leading-[1.04] text-white">{title}</h1>
        {(item.vote_average > 0 || item.release_date || item.first_air_date) && (
          <p className="mt-2 text-[13px] font-medium" style={{ color: 'var(--kz-text-secondary)' }}>
            {item.vote_average > 0 && <span style={{ color: 'var(--kz-accent)' }}>★ {Number(item.vote_average).toFixed(1)}</span>}
            {(item.release_date || item.first_air_date) && <span> · {String(item.release_date || item.first_air_date).slice(0, 4)}</span>}
          </p>
        )}
        {overview && <p className="mt-4 line-clamp-3 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--kz-text-secondary)' }}>{overview}</p>}
        <div className="mt-7 flex items-center gap-3">
          <button onClick={() => navigate(`/play/${isTV ? 'tv' : 'movie'}/${item.id}?expectedTitle=${encodeURIComponent(title)}`)}
            className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] kz-focus-ring"
            style={{ background: 'linear-gradient(135deg, var(--kz-play), var(--kz-accent))', boxShadow: '0 8px 28px -8px var(--kz-accent)', color: 'var(--kz-on-accent, #fff)' }}><Play size={18} weight="fill" /> Play</button>
          <button onClick={() => navigate(`/details/${isTV ? 'tv' : 'movie'}/${item.id}`)}
            className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium text-[var(--kz-text-secondary)] transition-colors hover:text-white kz-focus-ring"
            style={{ borderColor: 'var(--kz-border)' }}><Info size={18} /> More Info</button>
        </div>
      </motion.div>
    </section>
  );
}

function ContinueCard({ item }) {
  const navigate = useNavigate();
  const imgPath = item.poster_path || item.backdrop_path || null;
  const imgBase = item.poster_path ? API_CONFIG.IMG_URL_W500 : API_CONFIG.BACKDROP_URL;
  const poster = imgPath
    ? (String(imgPath).startsWith('http') ? imgPath : `${imgBase}${imgPath}`)
    : null;
  const lang = item.language || '';
  const playUrl = `/play/${item.type || (item.isTV ? 'tv' : 'movie')}/${item.id}?${item.isNetMirror ? 'netmirror=true&' : ''}expectedTitle=${encodeURIComponent(item.title || item.name || '')}${lang ? `&language=${encodeURIComponent(lang)}` : ''}`;
  return (
    <button onClick={() => navigate(playUrl)}
            className="group relative w-[260px] shrink-0 overflow-hidden rounded-xl border text-left"
            style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-2)' }}>
      {poster ? <img src={poster} alt="" loading="lazy" className="h-[120px] w-full object-cover opacity-70 transition-opacity group-hover:opacity-90" /> : <div className="h-[120px] bg-gradient-to-br from-[var(--kz-surface-2)] to-[var(--kz-bg)]" />}
      {lang && (
        <span className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white kz-glass">
          {lang}
        </span>
      )}
      <div className="p-3">
        <p className="truncate text-sm font-medium text-white">{item.title || item.name || 'Untitled'}</p>
        <p className="text-[11px] text-[var(--kz-text-muted)]">Resume watching{lang ? ` · ${lang}` : ''}</p>
      </div>
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [hero, setHero] = useState(null);
  const [recent, setRecent] = useState([]);
  const [prefs, setPrefs] = useState(loadUiPrefs);

  // Live-update when Settings toggles layout options.
  useEffect(() => {
    const sync = () => setPrefs(loadUiPrefs());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchDiscover('movie', 'trending').then((list) => {
      if (alive) setHero((list || []).find((x) => x.backdrop_path) || (list || [])[0] || null);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('recent_'));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const list = keys.map((k) => { try { return { key: k, ...JSON.parse(localStorage.getItem(k)) }; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
    setRecent(list);
    // One-time artwork backfill for entries saved before thumbnails existed.
    (async () => {
      let changed = false;
      for (const it of list) {
        if (it.poster_path || it.backdrop_path || !it.title) continue;
        try {
          const results = await searchMedia(it.title);
          const m = (results || []).find((r) => !r.isNetMirror);
          if (m?.poster_path || m?.backdrop_path) {
            const next = { ...it, poster_path: m.poster_path || null, backdrop_path: m.backdrop_path || null };
            delete next.key;
            localStorage.setItem(it.key, JSON.stringify(next));
            Object.assign(it, next);
            changed = true;
          }
        } catch { /* backfill failed for this title — keep text card */ }
      }
      // One-time migration for entries saved before the isNetMirror flag
      // existed. Without the flag the Continue card routes the id through the
      // TMDB resolver, and NetMirror ids then resolve by title search to a
      // different row/cut (or a TMDB id-collision lands on a different title).
      // Probe: if the NetMirror catalog has an entry with this exact id for
      // this title, the id is a NetMirror id.
      for (const it of list) {
        if (it.isNetMirror !== undefined || !it.title || !it.id) continue;
        try {
          const clean = String(it.title).replace(/\s*\[[A-Za-z]+\]\s*/g, ' ').replace(/\s*[Ss]\d+.*$/i, '').trim();
          const results = await searchMedia(clean || it.title);
          const next = { ...it, isNetMirror: (results || []).some((r) => r.isNetMirror && String(r.id) === String(it.id)) };
          delete next.key;
          localStorage.setItem(it.key, JSON.stringify(next));
          Object.assign(it, next);
          changed = true;
        } catch { /* probe failed — entry stays un-migrated, retried next load */ }
      }
      if (changed) setRecent([...list]);
    })();
  }, []);

  const browse = (to) => navigate(to);

  const visibleRails = HOME_RAILS.filter((r) => !prefs.hiddenRails[r.key]);

  return (
    <div className="h-full overflow-y-auto">
      {prefs.hero && <Hero item={hero} />}

      {prefs.continueWatching && recent.length > 0 && (
        <section className="px-10 pt-6">
          <div className="mb-3 flex items-center gap-2" style={{ color: 'var(--kz-accent)' }}><Clock size={17} /><h2 className="kz-display text-[17px] font-semibold text-[var(--kz-text)]">Continue Watching</h2></div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recent.map((it, i) => <ContinueCard key={`${it.id}-${i}`} item={it} />)}
          </div>
        </section>
      )}

      {/* Curated rails only — genre browsing lives under Movies/Series/Anime
          with full filters. Rails hide/minimize from Settings → Interface. */}
      <div className="flex flex-col gap-8 px-10 py-8">
        {visibleRails.map((r) => <Rail key={r.key} railKey={r.key} title={r.title} loader={r.load} />)}
      </div>

      <div className="flex flex-wrap gap-2 px-10 pb-10">
        {[
          { label: 'Browse all movies', to: '/discover/movie' },
          { label: 'Browse all series', to: '/discover/tv' },
          { label: 'Browse anime', to: '/anime' },
        ].map((c) => (
          <button key={c.label} onClick={() => browse(c.to)}
            className="rounded-full border border-[var(--kz-border)] px-4 py-1.5 text-[12px] font-medium text-[var(--kz-text-secondary)] transition-colors hover:border-[var(--kz-accent)] hover:text-white kz-focus-ring">
            {c.label} →
          </button>
        ))}
      </div>
    </div>
  );
}
