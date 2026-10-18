import { useEffect, useRef, useState } from 'react';
import { Play, Info } from '@phosphor-icons/react';
import { searchMedia, API_CONFIG } from '../services/api';

// Global streaming search for the desktop titlebar: type → instant poster
// results with quick Play / Info actions. Hash navigation (no router hooks)
// so it works in every shell. Enter opens the full Search screen.
function go(hash) { window.location.hash = hash; }

const dispTitle = (it) => it.title || it.originalTitle || it.name || '';
function destFor(item, direct) {
  const isTV = item.isTV ?? (item.media_type === 'tv');
  const type = isTV ? 'tv' : 'movie';
  const title = dispTitle(item);
  if (item.isNetMirror) {
    return `#/play/${type}/${item.id}?netmirror=true&expectedTitle=${encodeURIComponent(title)}`;
  }
  if (direct) return `#/play/${type}/${item.id}?expectedTitle=${encodeURIComponent(title)}`;
  if (item.anilistId) return `#/details/${type}/${item.id}?title=${encodeURIComponent(title)}`;
  return `#/details/${type}/${item.id}`;
}

const RECENT_KEY = 'kakumei-search-recent';
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}

export default function TitlebarSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(loadRecent);
  const boxRef = useRef(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) { setResults([]); setActive(0); return; }
    setOpen(true);
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchMedia(query);
        const list = (Array.isArray(r) ? r : []).filter((x) => x && dispTitle(x));
        setResults(list.slice(0, 8));
        setActive(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const remember = (query) => {
    const next = [query, ...recent.filter((x) => x !== query)].slice(0, 5);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };

  const submit = (idx) => {
    const query = q.trim();
    const item = results[idx];
    if (item) {
      remember(query || dispTitle(item) || '');
      setOpen(false);
      go(destFor(item, false));
    } else if (query) {
      remember(query);
      try { sessionStorage.setItem('kakumei-search-q', query); } catch {}
      setOpen(false);
      setQ('');
      go('#/search');
    }
  };

  const quickPlay = (e, item) => {
    e.stopPropagation();
    remember(dispTitle(item) || '');
    setOpen(false);
    go(destFor(item, true));
  };

  const showRecent = open && !q.trim() && recent.length > 0;
  const showResults = open && !!q.trim();

  return (
    <div ref={boxRef} className="relative ml-2 w-full min-w-0" style={{ maxWidth: '26rem', WebkitAppRegion: 'no-drag' }}>
      <div className="flex h-9 w-full items-center gap-2.5 rounded-xl border px-3.5 text-[13px] transition-colors focus-within:border-[var(--kz-accent)]"
        style={{ borderColor: 'var(--kz-border)', background: 'rgba(255,255,255,0.04)' }}>
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0 text-[var(--kz-text-muted)]">
          <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') submit(results.length ? active : -1);
            else if (e.key === 'Escape') { setOpen(false); e.target.blur(); }
          }}
          placeholder="Search movies, series, anime…"
          aria-label="Global search"
          className="min-w-0 flex-1 bg-transparent text-[var(--kz-text)] outline-none placeholder:text-[var(--kz-text-muted)]"
        />
        {q && (
          <button aria-label="Clear search" onClick={() => { setQ(''); setResults([]); }}
            className="shrink-0 text-[var(--kz-text-muted)] hover:text-white kz-focus-ring">✕</button>
        )}
      </div>

      {(showResults || showRecent) && (
        <div className="absolute left-0 right-0 top-full z-[10001] mt-2 max-h-[60vh] overflow-y-auto rounded-xl border shadow-2xl"
          style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' }}>
          {showResults && searching && results.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-[var(--kz-text-muted)]">Searching…</p>
          )}
          {showRecent && (
            <div className="p-2">
              <p className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--kz-text-muted)]">Recent</p>
              {recent.map((r) => (
                <button key={r} onClick={() => setQ(r)}
                  className="block w-full truncate px-2.5 py-2 text-left text-[13px] text-[var(--kz-text-secondary)] hover:bg-white/[0.06] hover:text-white">
                  {r}
                </button>
              ))}
            </div>
          )}
          {showResults && results.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-[var(--kz-text-muted)]">No matches — press Enter for full search.</p>
          )}
          {showResults && results.map((it, i) => {
            const title = dispTitle(it) || 'Untitled';
            const year = String(it.release_date || it.first_air_date || '').slice(0, 4);
            const poster = it.poster_path
              ? (String(it.poster_path).startsWith('http') ? it.poster_path : `${API_CONFIG.IMG_URL_W500}${it.poster_path}`)
              : null;
            return (
              <div key={`${it.id}-${it.media_type || ''}-${i}`}
                onClick={() => submit(i)}
                className={`group flex cursor-pointer items-center gap-3 px-2.5 py-2 ${i === active ? 'bg-white/[0.07]' : ''}`}>
                {poster
                  ? <img src={poster} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
                  : <div className="grid h-12 w-8 shrink-0 place-items-center rounded text-[10px] font-bold" style={{ background: 'var(--kz-surface-3)', color: 'var(--kz-text-muted)' }}>{title.slice(0, 1)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-white">{title}</p>
                  <p className="text-[11px] text-[var(--kz-text-muted)]">
                    {[year, (it.isTV ?? it.media_type === 'tv') ? 'Series' : 'Movie', it.language || it.displayLanguage].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button aria-label={`Play ${title}`} title="Quick play" onClick={(e) => quickPlay(e, it)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: 'var(--kz-play)' }}>
                  <Play size={13} weight="fill" />
                </button>
                <button aria-label={`Info for ${title}`} title="More info" onClick={(e) => { e.stopPropagation(); submit(i); }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 text-[var(--kz-text-secondary)] opacity-0 transition-opacity hover:text-white group-hover:opacity-100">
                  <Info size={13} />
                </button>
              </div>
            );
          })}
          {showResults && results.length > 0 && (
            <button onClick={() => submit(-1)}
              className="block w-full border-t px-4 py-2 text-left text-[12px] font-medium text-[var(--kz-text-muted)] hover:text-white"
              style={{ borderColor: 'var(--kz-border)' }}>
              See all results for “{q.trim()}” ↵
            </button>
          )}
        </div>
      )}
    </div>
  );
}
