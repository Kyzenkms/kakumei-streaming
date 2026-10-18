import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { FilmSlate, Television, Sparkle, TrendUp, Star, ShieldCheck, Faders, X } from '@phosphor-icons/react';
import { fetchDiscover, fetchAdultContent, fetchAdultLanguages, fetchDiscoverByLang } from '@app/services/api';
import { fetchAnilistTrending, fetchAnilistOngoing } from '@app/services/anilist';
import MediaCard from '../components/MediaCard';
import SyncButton from '@app/components/SyncButton';

const CATS = {
  movie:      { title: 'Movies',    sub: 'Latest feature films', icon: FilmSlate,  accent: '#a855f7', type: 'movie' },
  tv:         { title: 'TV Shows',  sub: 'Binge-worthy series',  icon: Television, accent: '#38bdf8', type: 'tv' },
  anime:      { title: 'Anime',     sub: 'Stylized animation',   icon: Sparkle,    accent: '#fb923c', type: 'tv', cat: 'anime' },
  popular:    { title: 'Popular',   sub: 'Trending globally',    icon: TrendUp,    accent: '#34d399', type: 'movie', cat: 'popular' },
  'top-rated':{ title: 'Top Rated', sub: "Critics' picks",      icon: Star,       accent: '#fbbf24', type: 'movie', cat: 'top_rated' },
  adult:      { title: '18+',       sub: 'Mature audiences only', icon: ShieldCheck,accent: '#ef4444', type: 'movie', cat: 'adult' },
};
const YEARS = ['', '2026','2025','2024','2023','2022','2021-2020','2015-2019','Before 2015'];
const RATINGS = [{ l: 'All', v: '' },{ l: '9+', v: '9' },{ l: '8+', v: '8' },{ l: '7+', v: '7' },{ l: '6+', v: '6' }];
const SORTS = [{ l: 'Most Popular', v: '' },{ l: 'Highest Rated', v: 'rating' },{ l: 'Newest', v: 'newest' },{ l: 'Oldest', v: 'oldest' },{ l: 'A → Z', v: 'az' }];
const GENRES = [{ id: '28', name: 'Action' },{ id: '35', name: 'Comedy' },{ id: '18', name: 'Drama' },{ id: '14', name: 'Fantasy' },{ id: '27', name: 'Horror' },{ id: '10749', name: 'Romance' },{ id: '878', name: 'Sci-Fi' },{ id: '53', name: 'Thriller' }];
const ANILIST_GENRES = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller'];
const LANGUAGES = [{ code: 'hindi', label: 'Hindi' },{ code: 'english', label: 'English' },{ code: 'tamil', label: 'Tamil' },{ code: 'telugu', label: 'Telugu' },{ code: 'korean', label: 'Korean' },{ code: 'japanese', label: 'Japanese' },{ code: 'spanish', label: 'Spanish' },{ code: 'french', label: 'French' }];

export default function Discover() {
  const { category = 'movie' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const meta = CATS[category] ?? CATS.movie;
  const Icon = meta.icon;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(false);
  const [adultLangs, setAdultLangs] = useState([]);
  const [adultLangFilter, setAdultLangFilter] = useState('');

  const langFilter = searchParams.get('lang') || '';
  const yearFilter = searchParams.get('year') || '';
  const ratingFilter = searchParams.get('rating') || '';
  const sortFilter = searchParams.get('sort') || '';
  const statusParam = searchParams.get('status');
  const genreParam = searchParams.get('genre');
  const fortmParams = Object.fromEntries([...searchParams]);

  useEffect(() => { if (category === 'adult') fetchAdultLanguages().then(setAdultLangs).catch(() => {}); }, [category]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
     
    setItems([]);
    const queryParams = Object.fromEntries([...searchParams]);
    if (category === 'adult') fetchAdultContent().then(d => { if (alive) { setItems(d || []); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    else if (langFilter && (meta.type === 'movie' || meta.type === 'tv')) fetchDiscoverByLang(langFilter, meta.type).then(d => { if (alive) { setItems(d || []); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    else if (queryParams.provider === 'anilist') {
      const p = queryParams.status === 'releasing' ? fetchAnilistOngoing(1, 40, queryParams.genre) : fetchAnilistTrending(1, 40, queryParams.genre);
      p.then(d => { if (alive) { setItems(d || []); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    } else fetchDiscover(meta.type, meta.cat || 'trending', queryParams).then(d => { if (alive) { setItems(d || []); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category, searchParams, meta, langFilter]);

  const filtered = useMemo(() => {
    let r = [...items];
    if (category === 'adult' && adultLangFilter) r = r.filter(i => i.language === adultLangFilter);
    if (yearFilter) r = r.filter(i => {
      const d = i.release_date || i.first_air_date || '';
      if (yearFilter === '2021-2020') return d >= '2020' && d < '2022';
      if (yearFilter === '2015-2019') return d >= '2015' && d < '2020';
      if (yearFilter === 'Before 2015') return d < '2015';
      return d.startsWith(yearFilter);
    });
    if (ratingFilter) r = r.filter(i => (i.vote_average || 0) >= parseFloat(ratingFilter));
    if (sortFilter === 'rating') r.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    if (sortFilter === 'newest') r.sort((a, b) => ((b.release_date || b.first_air_date || '') > (a.release_date || a.first_air_date || '') ? 1 : -1));
    if (sortFilter === 'oldest') r.sort((a, b) => ((a.release_date || a.first_air_date || '') > (b.release_date || b.first_air_date || '') ? 1 : -1));
    if (sortFilter === 'az') r.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
    return r;
  }, [items, yearFilter, ratingFilter, sortFilter, category, adultLangFilter]);

  const updateFilter = (key, value) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value); else p.delete(key);
    setSearchParams(p);
  };
  const hasFilters = yearFilter || ratingFilter || sortFilter || statusParam || genreParam || langFilter;
  const clearAll = () => setSearchParams(new URLSearchParams());

  return (
    <div className="flex h-full flex-col overflow-y-auto px-10 py-6">
      <div className="mb-5 flex items-center gap-4 rounded-2xl border px-6 py-5"
           style={{ borderColor: `${meta.accent}22`, background: `linear-gradient(135deg, ${meta.accent}12, transparent 55%)` }}>
        <span className="grid h-11 w-11 place-items-center rounded-xl border" style={{ borderColor: `${meta.accent}25`, background: `${meta.accent}18` }}>
          <Icon size={22} style={{ color: meta.accent }} />
        </span>
        <div className="min-w-0">
          <h1 className="kz-display text-2xl font-bold text-white">{statusParam === 'ongoing' ? 'Ongoing ' : ''}{genreParam ? 'Genre: ' : ''}{meta.title}</h1>
          <p className="text-xs" style={{ color: 'var(--kz-text-muted)' }}>{meta.sub}{!loading && ` · ${filtered.length} titles`}</p>
        </div>
        {(category === 'anime' || fortmParams.cat === 'anime') && <div className="ml-auto flex gap-2"><SyncButton type="anilist" /><SyncButton type="mal" /></div>}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {Object.entries(CATS).filter(([k]) => k !== 'anime').map(([k, c]) => (
          <NavLink key={k} to={`/discover/${k}`} className={`rounded-full border px-4 py-1.5 text-[13px] font-medium ${k === category ? 'bg-white text-black' : 'text-[var(--kz-text-muted)] border-[var(--kz-border)] hover:text-white'}`}>
            {c.title}
          </NavLink>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button onClick={() => setFilters(!filters)} className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-medium ${filters || hasFilters ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)]'}`}>
          <Faders size={15} /> Filters {hasFilters && <span className="rounded-md nm-badge-count px-1.5 py-0.5 text-[10px] font-bold text-white">{[yearFilter, ratingFilter, sortFilter, statusParam, genreParam, langFilter].filter(Boolean).length}</span>}
        </button>
        {hasFilters && <button onClick={clearAll} className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400"><X size={13}/> Clear all</button>}
      </div>

      {filters && (
        <div className="mb-6 grid grid-cols-2 gap-4 rounded-2xl border p-5 md:grid-cols-4" style={{ borderColor: 'var(--kz-border)', background: 'var(--kz-surface-1)' }}>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Year<select value={yearFilter} onChange={(e) => updateFilter('year', e.target.value)} className="mt-1.5 w-full kz-select text-sm">{YEARS.map(y => <option key={y} value={y}>{y || 'All years'}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Rating<select value={ratingFilter} onChange={(e) => updateFilter('rating', e.target.value)} className="mt-1.5 w-full kz-select text-sm">{RATINGS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Sort<select value={sortFilter} onChange={(e) => updateFilter('sort', e.target.value)} className="mt-1.5 w-full kz-select text-sm">{SORTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Language<select value={langFilter} onChange={(e) => updateFilter('lang', e.target.value)} className="mt-1.5 w-full kz-select text-sm"><option value="">All languages</option>{LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Genre<select value={genreParam || ''} onChange={(e) => updateFilter('genre', e.target.value)} className="mt-1.5 w-full kz-select text-sm"><option value="">All genres</option>{(category === 'anime' ? ANILIST_GENRES.map(g => ({ id: g, name: g })) : GENRES).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Provider<select value={fortmParams.provider || ''} onChange={(e) => updateFilter('provider', e.target.value)} className="mt-1.5 w-full kz-select text-sm"><option value="">Default</option><option value="anilist">Anilist</option></select></label>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Status<select value={statusParam || ''} onChange={(e) => updateFilter('status', e.target.value)} className="mt-1.5 w-full kz-select text-sm"><option value="">Any</option><option value="releasing">Releasing</option><option value="ongoing">Ongoing</option></select></label>
          {category === 'adult' && <label className="text-xs font-semibold uppercase tracking-wider text-[var(--kz-text-muted)]">Language<select value={adultLangFilter} onChange={(e) => setAdultLangFilter(e.target.value)} className="mt-1.5 w-full kz-select text-sm"><option value="">All</option>{adultLangs.map(l => <option key={l} value={l}>{l}</option>)}</select></label>}
        </div>
      )}

      {!loading && filtered.length === 0 && <p className="py-20 text-center text-sm" style={{ color: 'var(--kz-text-muted)' }}>No titles match these filters.</p>}
      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">{Array.from({ length: 18 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg kz-skeleton" />)}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">{filtered.map((it, idx) => <MediaCard key={`${it.id}-${it.media_type || ''}-${idx}`} item={it} />)}</div>
      )}
    </div>
  );
}
