import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { searchMedia } from '@app/services/api';
import MediaCard from '../components/MediaCard';

export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | done
  const [langFilter, setLangFilter] = useState('all');
  const inputRef = useRef(null);

  // Handoff from the titlebar global search (Enter → full results).
  useEffect(() => {
    try {
      const handoff = sessionStorage.getItem('kakumei-search-q');
      if (handoff) { sessionStorage.removeItem('kakumei-search-q'); setQ(handoff); }
    } catch { /* sessionStorage unavailable — manual typing still works */ }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const query = q.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!query) { setResults([]); setState('idle'); return; }
     
    setState('loading');
    const t = setTimeout(() => {
      searchMedia(query)
        .then((r) => { setResults(Array.isArray(r) ? r.filter((x) => x && x.id) : []); setState('done'); })
        .catch(() => { setResults([]); setState('done'); });
    }, 320);
    return () => clearTimeout(t);
  }, [q]);

  const languageOf = (it) => (it.language || it.displayLanguage || it._langCode || it.original_language || '').toString().toLowerCase();
  const languages = Array.from(new Set(results.map(languageOf).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const visible = langFilter === 'all' ? results : results.filter((it) => languageOf(it).startsWith(langFilter));

  return (
    <div className="flex h-full flex-col">
      <div className="px-10 pt-5">
        <div className="flex items-center gap-3 rounded-2xl border px-4 py-3"
             style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)' }}>
          <MagnifyingGlass size={20} className="text-[var(--kz-text-muted)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search movies, series, anime…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--kz-text)] outline-none placeholder:text-[var(--kz-text-muted)]"
            aria-label="Search"
          />
          {q && (
            <button aria-label="Clear" onClick={() => setQ('')} className="text-[var(--kz-text-muted)] hover:text-white kz-focus-ring">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {languages.length > 1 && (
        <div className="flex flex-wrap gap-2 px-10 pt-4">
          {['all', ...languages].map((lang) => (
            <button key={lang} onClick={() => setLangFilter(lang)}
              className="rounded-full border px-3 py-1 text-[12px] font-medium capitalize transition-colors kz-focus-ring"
              style={{
                borderColor: langFilter === lang ? 'var(--kz-accent)' : 'var(--kz-border)',
                background: langFilter === lang ? 'var(--kz-accent-soft)' : 'transparent',
                color: langFilter === lang ? 'white' : 'var(--kz-text-muted)',
              }}>
              {lang}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-10 py-5">
        {state === 'idle' && (
          <div className="grid h-full place-items-center">
            <p className="text-sm" style={{ color: 'var(--kz-text-muted)' }}>Start typing to search the catalog.</p>
          </div>
        )}
        {state === 'loading' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-lg kz-skeleton" />
            ))}
          </div>
        )}
        {state === 'done' && visible.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="kz-display text-lg font-semibold text-[var(--kz-text)]">No results</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--kz-text-muted)' }}>Try a different title or spelling.</p>
            </div>
          </div>
        )}
        {state === 'done' && visible.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] justify-items-start gap-5">
            {visible.map((it, idx) => <MediaCard key={`${it.id}-${it.media_type || ''}-${idx}`} item={it} />)}
          </div>
        )}
      </div>
    </div>
  );
}
