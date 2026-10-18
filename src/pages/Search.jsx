import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, X, Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MediaGrid, { MediaGridSkeleton } from '../components/MediaGrid';
import { searchMedia } from '../services/api';

const LANG_EMOJI = {
  hindi: '🇮🇳', english: '🇺🇸', spanish: '🇪🇸', french: '🇫🇷', german: '🇩🇪',
  japanese: '🇯🇵', korean: '🇰🇷', portuguese: '🇧🇷', italian: '🇮🇹', chinese: '🇨🇳',
  arabic: '🇸🇦', turkish: '🇹🇷', russian: '🇷🇺', thai: '🇹🇭', indonesian: '🇮🇩',
  original: '🎬',
};

function yearOf(it) {
  return String(it.release_date || it.first_air_date || '').slice(0, 4);
}

function isAnimation(it) {
  const ids = it.genre_ids || (it.genres || []).map(g => g.id) || [];
  return ids.includes(16);
}

function baseTitle(it) {
  return String(it.title || it.originalTitle || '')
    .toLowerCase()
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*[Ss]\d+([-\s]*\d+)*\s*$/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// NetMirror returns many near-identical entries for one name ("Reborn S1" from
// 2018, 2023, 2025, 2026 are different works but look the same in a grid).
// Collapsing on title+year means each distinct work gets one slot, instead of
// the real match being buried ten deep behind unrelated live-action entries.
function dedupeByWork(items) {
  const seen = new Map();
  for (const it of items || []) {
    const year = String(it.release_date || it.first_air_date || '').slice(0, 4) || '?';
    const key = `${baseTitle(it)}|${year}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, it); continue; }
    const rank = (x) => (x.poster_path ? 1 : 0) + (x.isNetMirror ? 0.5 : 0);
    if (rank(it) > rank(prev)) seen.set(key, it);
  }
  return [...seen.values()];
}

// NetMirror stores each dub as its own catalog entry titled "Show [Hindi]".
// That made dubs flood the main results. Split them out instead.
function splitResults(items) {
  const originals = [];
  const dubs = [];
  for (const it of items || []) {
    const lang = String(it.language || '').toLowerCase();
    if (it.isNetMirror && lang && lang !== 'original') dubs.push(it);
    else originals.push(it);
  }
  return { originals, dubs };
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [input, setInput] = useState(q);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('original'); // 'original' | 'dubs'
  const [lang, setLang] = useState('all');
  const [kind, setKind] = useState('all'); // all | anime | movie | tv
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!q) { setItems([]); setError(false); return; }
    setLoading(true);
    setError(false);
    setItems(null);
    searchMedia(q)
      .then(data => { if (mounted.current) setItems(data || []); })
      .catch(() => { if (mounted.current) setError(true); })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, [q]);

  const { originals, dubs, animeCount } = useMemo(() => {
    const s = splitResults(items);

    // TMDB knows which works are Animation (genre 16); NetMirror search
    // results carry no genre at all. Cross-reference by title+year so a
    // NetMirror entry can be recognised as anime — that's the only way to tell
    // "Reborn!" (2006 anime) from the live-action shows sharing the name.
    const animated = new Set();
    (items || []).forEach(it => {
      if (it.isNetMirror) return;
      if (isAnimation(it)) animated.add(`${baseTitle(it)}|${yearOf(it)}`);
    });
    const tag = (it) => ({
      ...it,
      _anime: it.isNetMirror ? animated.has(`${baseTitle(it)}|${yearOf(it)}`) : isAnimation(it),
    });

    const tagged = dedupeByWork(s.originals).map(tag);
    return {
      originals: tagged,
      dubs: dedupeByWork(s.dubs).map(tag),
      animeCount: tagged.filter(i => i._anime).length,
    };
  }, [items]);

  const langs = useMemo(() => {
    const counts = {};
    dubs.forEach(d => {
      const l = String(d.language || 'other').toLowerCase();
      counts[l] = (counts[l] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [dubs]);

  const visible = useMemo(() => {
    const base = tab === 'original'
      ? originals
      : (lang === 'all' ? dubs : dubs.filter(d => String(d.language || '').toLowerCase() === lang));
    if (kind === 'anime') return base.filter(i => i._anime);
    if (kind === 'movie') return base.filter(i => !i.isTV && i.media_type !== 'tv');
    if (kind === 'tv') return base.filter(i => i.isTV || i.media_type === 'tv');
    return base;
  }, [tab, lang, kind, originals, dubs]);

  const submit = (e) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    setParams({ q: val }, { replace: true });
  };

  const TabBtn = ({ id, label, count }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
        tab === id ? 'bg-purple-600 text-white' : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08]'
      }`}
    >
      {label} {typeof count === 'number' && <span className="opacity-60">{count}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white pt-14 sm:pt-16">
      <Navbar />

      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1600px] mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Search</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Originals from TMDB &amp; NetMirror — dubbed versions live in the Dubs tab
          </p>
        </div>

        <form onSubmit={submit} className="mb-6">
          <div className="relative max-w-2xl">
            <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Search movies, shows, anime..."
              autoFocus
              className="w-full bg-zinc-900/90 border border-white/10 rounded-2xl pl-11 pr-24 py-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/60 focus:bg-zinc-900 shadow-lg shadow-black/10 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {input && (
                <button type="button" onClick={() => setInput('')} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
                  <X size={16} />
                </button>
              )}
              <button type="submit" className="px-4 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-black uppercase tracking-wider hover:bg-purple-500 transition-all active:scale-95">
                Search
              </button>
            </div>
          </div>
        </form>

        {q && items && (
          <div className="mb-5 space-y-3">
            <div className="flex items-center gap-2">
              <TabBtn id="original" label="Original" count={originals.length} />
              <TabBtn id="dubs" label="Dubs" count={dubs.length} />
            </div>

            {/* Type filter. Without this, a name shared by many works (e.g.
                "Reborn" — ~14 of them) buries the one you actually meant. */}
            <div className="flex items-center gap-1.5">
              {[
                ['all', 'All', tab === 'original' ? originals.length : dubs.length],
                ['anime', 'Anime', animeCount],
                ['movie', 'Movies', (tab === 'original' ? originals : dubs).filter(i => !i.isTV && i.media_type !== 'tv').length],
                ['tv', 'Series', (tab === 'original' ? originals : dubs).filter(i => i.isTV || i.media_type === 'tv').length],
              ].map(([k, label, n]) => (
                <button key={k} onClick={() => setKind(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    kind === k
                      ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                      : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white'
                  }`}
                >
                  {label} <span className="opacity-60">{n}</span>
                </button>
              ))}
            </div>

            {tab === 'dubs' && langs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setLang('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    lang === 'all' ? 'bg-sky-500/20 text-sky-200 border-sky-500/40' : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white'
                  }`}
                >
                  All {dubs.length}
                </button>
                {langs.map(([l, n]) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all ${
                      lang === l ? 'bg-sky-500/20 text-sky-200 border-sky-500/40' : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className="mr-1">{LANG_EMOJI[l] || '🌍'}</span>
                    {l} <span className="opacity-60">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <MediaGridSkeleton count={12} />
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-zinc-500">Something went wrong while searching.</p>
          </div>
        ) : !q ? (
          <div className="py-16 text-center">
            <SearchIcon size={36} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">Type a title above and hit Search</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-zinc-500">
              No {tab === 'dubs' ? 'dubbed' : 'original'} results for &quot;{q}&quot;
              {tab === 'original' && dubs.length > 0 && (
                <button onClick={() => setTab('dubs')} className="block mx-auto mt-2 text-purple-400 hover:text-purple-300 text-xs font-bold">
                  Try the {dubs.length} dubbed version{dubs.length === 1 ? '' : 's'} instead
                </button>
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-zinc-400">
                {visible.length} result{visible.length === 1 ? '' : 's'} for &quot;{q}&quot;
              </h2>
            </div>
            <MediaGrid items={visible} />
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}
