import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Play, BookmarkSimple, Heart, ShareNetwork, Star, Clock, PlayCircle, ListBullets } from '@phosphor-icons/react';
import { searchMedia, getDetails, getRecommendations, getSeasons, getEpisodes } from '@app/services/api';
import Comments from '@app/components/Comments';
import MediaCard from '../components/MediaCard';

const LANG_ORDER = ['english', 'hindi', 'original', 'tamil', 'telugu', 'malayalam', 'korean', 'japanese', 'spanish', 'french'];

function LanguageButton({ lang, type, title }) {
  return <Link to={`/play/${type}/${lang.id}?netmirror=true${title ? `&expectedTitle=${encodeURIComponent(title)}` : ''}`} className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--kz-text-secondary)] no-underline transition-colors hover:border-[var(--kz-accent)] hover:text-white">{lang.language || 'Dub'}</Link>;
}

export default function Details() {
  const { type, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [media, setMedia] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [activeSeason, setActiveSeason] = useState(1);

  const title = media?.title || media?.name || '';
  const cleanId = useMemo(() => (id || '').split('_')[0], [id]);
  const isTV = type === 'tv';

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
     
    setMedia(null);
     
    setRecs([]);
     
    setLanguages([]);
    (async () => {
      const queryTitle = searchParams.get('title');
      let success = false;
      const load = async (targetId, targetType = type) => {
        try {
          const d = await getDetails(targetId, targetType === 'tv');
          if (alive && d && d.id && d.success !== false) {
            setMedia(d);
            setIsBookmarked(localStorage.getItem(`bookmark_${targetType}_${d.id}`) !== null);
            setIsLiked(localStorage.getItem(`like_${targetType}_${d.id}`) !== null);
            return true;
          }
        } catch { /* details fetch failed for this id — caller keeps null */ }
        return false;
      };
      if (queryTitle) {
        const results = await searchMedia(queryTitle);
        const tq = queryTitle.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const scored = (results || []).filter(r => !r.isNetMirror).map(r => {
          const t = (r.title || r.name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
          let s = 0;
          if (tq && t === tq) s += 1000; else if (tq && t.startsWith(tq)) s += 500; else if (tq && t.includes(tq)) s += 300;
          if (r.media_type === 'tv') s += 10;
          return { r, s };
        }).sort((a, b) => b.s - a.s);
        const match = scored[0]?.r;
        if (match) success = await load(match.id, match.media_type || type);
      }
      if (!success) { await load(cleanId, type); }
      if (!alive) return;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [cleanId, type, searchParams]);

  useEffect(() => {
    let alive = true;
    if (!media?.id) return;
    (async () => {
      const [recsR, langsR] = await Promise.allSettled([
        getRecommendations(media.id, isTV),
        title ? fetch(`/api/netmirror/languages?title=${encodeURIComponent(title)}`).then(r => r.json()) : Promise.resolve([]),
      ]);
      if (!alive) return;
      if (recsR.status === 'fulfilled') setRecs(recsR.value || []);
      if (langsR.status === 'fulfilled') {
        const uniq = [...new Map((langsR.value || []).map(l => [String(l.language || '').toLowerCase(), l])).values()].sort((a, b) => LANG_ORDER.indexOf(String(a.language||'').toLowerCase()) - LANG_ORDER.indexOf(String(b.language||'').toLowerCase()));
        setLanguages(uniq);
      }
    })();
    return () => { alive = false; };
  }, [media?.id, isTV, title]);

  useEffect(() => {
    if (!isTV || !media?.id) return;
    getSeasons(media.id).then((s) => {
      const list = Array.isArray(s) ? s : [];
      setSeasons(list);
      // Default to season 1 (not S0 specials) when it exists.
      if (list?.length) setActiveSeason(list.some((x) => x.season_number === 1) ? 1 : list[0].season_number);
    });
  }, [isTV, media?.id]);

  useEffect(() => {
    if (!isTV || !media?.id) return;
    getEpisodes(media.id, activeSeason).then(setEpisodes).catch(() => setEpisodes([]));
  }, [isTV, media?.id, activeSeason]);

  const toggleBookmark = () => {
    if (!media) return;
    const key = `bookmark_${type}_${media.id}`;
    if (isBookmarked) { localStorage.removeItem(key); setIsBookmarked(false); }
    else { localStorage.setItem(key, JSON.stringify({ ...media, isTV, timestamp: Date.now() })); setIsBookmarked(true); }
    window.dispatchEvent(new Event('storage'));
  };
  const toggleLike = () => {
    if (!media) return;
    const key = `like_${type}_${media.id}`;
    if (isLiked) { localStorage.removeItem(key); setIsLiked(false); }
    else { localStorage.setItem(key, JSON.stringify({ ...media, isTV, timestamp: Date.now() })); setIsLiked(true); }
    window.dispatchEvent(new Event('storage'));
  };

  if (loading) return <div className="grid h-full place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-2 border-white/15" style={{ borderTopColor: 'var(--kz-accent)' }} /></div>;
  if (!media) return <div className="grid h-full place-items-center text-center"><div><p className="kz-display text-xl font-semibold text-white">Title not found</p><p className="mt-2 text-sm text-[var(--kz-text-muted)]">Try searching instead.</p></div></div>;

  const runtime = media.runtime ? `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m` : (media.episode_run_time?.[0] ? `${media.episode_run_time[0]}m/episode` : null);
  const year = (media.release_date || media.first_air_date || '').slice(0, 4);
  const poster = media.poster_path ? (String(media.poster_path).startsWith('http') ? media.poster_path : `https://image.tmdb.org/t/p/w500${media.poster_path}`) : null;
  const backdrop = media.backdrop_path ? (String(media.backdrop_path).startsWith('http') ? media.backdrop_path : `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`) : null;
  const expectedTitle = encodeURIComponent(title);

  return (
    <div className="h-full overflow-y-auto">
      <section className="relative overflow-hidden px-10 py-12">
        {backdrop && <img src={backdrop} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/70 to-black" />
        <div className="relative flex gap-8">
          <div className="w-[220px] shrink-0 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--kz-border)' }}>
            {poster ? <img src={poster} alt={title} className="aspect-[2/3] w-full object-cover" /> : <div className="grid aspect-[2/3] place-items-center text-sm text-[var(--kz-text-muted)]">No art</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kz-text-muted)]">
              <span>{isTV ? 'Series' : 'Film'}</span>
              {year && <span>· {year}</span>}
              {media.vote_average > 0 && <span className="flex items-center gap-1"><Star size={12} weight="fill" style={{ color: 'var(--kz-accent)' }} /> {Number(media.vote_average).toFixed(1)}</span>}
              {runtime && <span className="flex items-center gap-1"><Clock size={12}/> {runtime}</span>}
            </div>
            <h1 className="kz-display text-4xl font-bold leading-tight text-white">{title}</h1>
            {media.genres?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{media.genres.slice(0, 5).map(g => <span key={g.id || g.name} className="rounded-full border px-3 py-1 text-[11px] font-medium text-[var(--kz-text-secondary)]" style={{ borderColor: 'var(--kz-border)' }}>{g.name}</span>)}</div>}
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--kz-text-secondary)] line-clamp-5">{media.overview}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button onClick={() => navigate(`/play/${type}/${media.id}?expectedTitle=${expectedTitle}${isTV ? `&season=${activeSeason}&episode=1` : ''}`)} className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold" style={{ background: 'var(--kz-play)', color: 'var(--kz-on-accent, #fff)' }}><Play size={18} weight="fill" /> Play{isTV ? ` S${activeSeason}` : ''}</button>
              <button onClick={toggleBookmark} className={`grid h-11 w-11 place-items-center rounded-xl border ${isBookmarked ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)]'}`}><BookmarkSimple size={19} /></button>
              <button onClick={toggleLike} className={`grid h-11 w-11 place-items-center rounded-xl border ${isLiked ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)]'}`}><Heart size={19} /></button>
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)} className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--kz-border)] text-[var(--kz-text-muted)]"><ShareNetwork size={19} /></button>
            </div>
            {languages.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--kz-text-muted)]">Available dubs</p>
                <div className="flex flex-wrap gap-2">{languages.map((l) => <LanguageButton key={l.id} lang={l} type={type} title={title} />)}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {isTV && seasons.length > 0 && (
        <section className="px-10 py-4">
          <div className="mb-3 flex items-center gap-3"><ListBullets size={18} className="text-[var(--kz-accent)]" /><h2 className="kz-display text-lg font-semibold text-white">Seasons</h2></div>
          <div className="flex flex-wrap gap-2">{seasons.map(s => <button key={s.season_number} onClick={() => setActiveSeason(s.season_number)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${activeSeason === s.season_number ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)]'}`}>S{s.season_number}</button>)}</div>
          {episodes.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
              {episodes.slice(0, 24).map(ep => (
                <button key={ep.id} onClick={() => navigate(`/play/tv/${media.id}?expectedTitle=${encodeURIComponent(title)}&season=${activeSeason}&episode=${ep.episode_number}`)}
                        className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-white/[0.04]" style={{ borderColor: 'var(--kz-border)' }}>
                  <PlayCircle size={22} className="text-white/80" />
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-white">E{ep.episode_number} · {ep.name}</p><p className="truncate text-[11px] text-[var(--kz-text-muted)]">{ep.air_date || ''}</p></div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {recs.length > 0 && (
        <section className="px-10 py-8">
          <h2 className="mb-4 kz-display text-lg font-semibold text-white">More like this</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">{recs.map((it, idx) => <MediaCard key={`${it.id}-${it.media_type || ''}-${idx}`} item={it} />)}</div>
        </section>
      )}

      <section className="px-10 pb-12">
        <Comments mediaId={`${type}_${media.id}`} />
      </section>
    </div>
  );
}
