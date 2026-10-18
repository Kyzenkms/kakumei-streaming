import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Warning, ArrowClockwise, ListBullets, Lightning, CaretLeft, CaretRight, CaretDown, Users } from '@phosphor-icons/react';
import NetMirrorPlayer from '@app/components/NetMirrorPlayer';
import WatchPartyPanel from '@app/components/WatchPartyPanel';
import { watchParty } from '@app/services/watchparty';
import { resolveNetMirrorStream, getDetails, getRecommendations, getSeasons, getEpisodes, searchMedia, friendlyStreamError } from '@app/services/api';
import MediaCard from '../components/MediaCard';

function buildEmbeds(tmdbId, isTV, season, episode) {
  if (!tmdbId) return [];
  const s = season || 1;
  const e = episode || 1;
  const slash = isTV ? `/tv/${tmdbId}/${s}/${e}` : `/movie/${tmdbId}`;
  const vidlinkPath = isTV ? `/tv/${tmdbId}/${s}/${e}` : `/movie/${tmdbId}`;
  return [
    { key: 'server1', label: 'Server 1', badge: 'FAST', url: `https://bingr.one/embed${slash}?color=a855f7` },
    { key: 'server2', label: 'Server 2', badge: 'MULTI', url: `https://vidsync.pro/embed${slash}` },
    { key: 'server3', label: 'Vidnest', badge: isTV ? 'SERIES' : 'MOVIE', url: `https://vidnest.fun${slash}` },
    { key: 'vidlink', label: 'VidLink', badge: isTV ? 'SERIES' : 'MOVIE', url: `https://vidlink.pro${vidlinkPath}` },
  ];
}

export default function Watch() {
  const { type, id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const isNetMirror = sp.get('netmirror') === 'true';
  const adult = sp.get('adult') === 'true';
  const isTV = type === 'tv';
  const expectedTitle = sp.get('expectedTitle') || '';
  const language = sp.get('language') || '';
  const season = Number(sp.get('season') || 1);
  const episode = Number(sp.get('episode') || 1);

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errMsg, setErrMsg] = useState('');
  const [title, setTitle] = useState(expectedTitle);
  const [attempt, setAttempt] = useState(0);
  const [ext, setExt] = useState(null); // { label, url }
  const [recs, setRecs] = useState([]);
  const [embedTmdbId, setEmbedTmdbId] = useState(isNetMirror ? null : id);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [slowLoad, setSlowLoad] = useState(false);
  const [srvOpen, setSrvOpen] = useState(true);
  const [epOpen, setEpOpen] = useState(true);
  const [showParty, setShowParty] = useState(() => !!sp.get('party'));
  const partyNavRef = useRef(false);
  // Live playback state for the party panel's sync broadcasts. timeupdate is
  // throttled to ~2/s so the panel re-renders don't churn.
  const [partyTime, setPartyTime] = useState(0);
  const [partyPlaying, setPartyPlaying] = useState(false);
  const lastPartyTick = useRef(0);
  const containerRef = useRef(null);

  // If resolving takes a while, say so — a static spinner feels broken.
  useEffect(() => {
    if (status !== 'loading') { setSlowLoad(false); return; }
    const t = setTimeout(() => setSlowLoad(true), 4000);
    return () => clearTimeout(t);
  }, [status, attempt, id, season, episode]);

  // TMDB-backed server buttons + More Like This. NetMirror ids are not TMDB
  // ids, so for those we find the closest TMDB match by title first.
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!isNetMirror) {
        setEmbedTmdbId(id);
        try { setRecs(await getRecommendations(id, isTV)); } catch { /* rec fetch failed — no row shown */ }
        return;
      }
      if (!title) return;
      try {
        const results = await searchMedia(title);
        const match = (results || []).find((r) => !r.isNetMirror && (r.media_type === type));
        if (!alive || !match) return;
        setEmbedTmdbId(match.id);
        setRecs(await getRecommendations(match.id, match.media_type === 'tv'));
      } catch { /* embed/rec lookup via title failed — only NetMirror player shown */ }
    }
    load();
    return () => { alive = false; };
  }, [isNetMirror, id, isTV, title, type]);

  // Language dubs available for this exact work (NetMirror catalog variants).
  useEffect(() => {
    let alive = true;
    if (!title) return;
    fetch(`/api/netmirror/languages?title=${encodeURIComponent(title)}`)
      .then((r) => r.json())
      .then((list) => { if (alive) setLanguages(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setLanguages([]); });
    return () => { alive = false; };
  }, [title]);

  // TMDB seasons/episodes for TV.
  useEffect(() => {
    if (!isTV || isNetMirror) return;
    getSeasons(id).then((s) => setSeasons(Array.isArray(s) ? s : [])).catch(() => setSeasons([]));
  }, [isTV, id, isNetMirror]);
  useEffect(() => {
    if (!isTV || isNetMirror) return;
    getEpisodes(id, season).then((eps) => setEpisodes(Array.isArray(eps) ? eps : [])).catch(() => setEpisodes([]));
  }, [isTV, id, season, isNetMirror]);

  // Only TMDB ids go through getDetails; NetMirror ids are not TMDB ids and
  // resolve straight from the stream endpoint instead.
  useEffect(() => {
    if (isNetMirror) return;
    let alive = true;
    getDetails(id, isTV).then((d) => { if (alive && d) setTitle(d.title || d.name || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [id, isTV, isNetMirror]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading');
    setErrMsg('');
    setData(null);
    resolveNetMirrorStream({
      id, type: isTV ? 'tv' : 'movie', season, episode, language,
      isNetMirror, title: expectedTitle || title, fresh: attempt > 0,
    })
      .then((res) => {
        if (!alive) return;
        if (res?.success && res.sources?.length) {
          setData(res);
          if (res.title) setTitle(res.title);
          const finalTitle = res.title || expectedTitle || '';
          const recentKey = `recent_${type}_${id}`;
          const writeRecent = (art = {}) => {
            try {
              localStorage.setItem(recentKey, JSON.stringify({ id, title: finalTitle, language: res.language || language || '', isTV, type, isNetMirror, timestamp: Date.now(), ...art }));
              window.dispatchEvent(new Event('storage'));
            } catch { /* localStorage unavailable — watch progress still works */ }
          };
          writeRecent();
          // Artwork arrives in the background so Continue Watching shows real
          // thumbnails instead of blank cards. Never blocks playback.
          (async () => {
            try {
              let poster_path = null, backdrop_path = null;
              if (!isNetMirror) {
                const d = await getDetails(id, isTV);
                poster_path = d?.poster_path || null;
                backdrop_path = d?.backdrop_path || null;
              } else if (finalTitle) {
                const results = await searchMedia(finalTitle);
                const m = (results || []).find((r) => !r.isNetMirror && (r.media_type || (r.isTV ? 'tv' : 'movie')) === type)
                  || (results || []).find((r) => !r.isNetMirror);
                poster_path = m?.poster_path || null;
                backdrop_path = m?.backdrop_path || null;
              }
              if (poster_path || backdrop_path) writeRecent({ poster_path, backdrop_path });
            } catch { /* artwork backfill failed — text card still works */ }
          })();
        } else if (res?.success && res.isEmbedOnly && res.embeds?.length) {
          // No direct stream — NetMirror only offers third-party servers here.
          // Auto-load the first live embed so the title plays immediately.
          const first = res.embeds[0];
          setData(res);
          if (res.title) setTitle(res.title);
          setExt({ label: first.label || 'Server', url: first.url });
          setStatus('ready');
          // Embed-only plays count as watched too.
          try {
            localStorage.setItem(`recent_${type}_${id}`, JSON.stringify({ id, title: res.title || expectedTitle || '', language: res.language || language || '', isTV, type, isNetMirror, timestamp: Date.now() }));
            window.dispatchEvent(new Event('storage'));
          } catch { /* localStorage unavailable — ignored */ }
        } else {
          setStatus('error');
          setErrMsg(res?.code && res.code !== res?.error ? `${res.error} (${res.code})` : (res?.error || 'no_sources'));
        }
      })
      .catch((e) => { if (alive) { setStatus('error'); setErrMsg(e?.message || 'fetch_failed'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, isNetMirror, attempt, season, episode]);

  const serverList = useMemo(() => {
    const live = Array.isArray(data?.embeds) ? data.embeds : [];
    const seen = new Set();
    const liveServers = live.map((e, i) => {
      let host = '';
      try { host = new URL(e.url).hostname.replace(/^www\./, ''); } catch (_) {}
      if (seen.has(host)) return null;
      seen.add(host);
      return { key: `live-${host || i}`, label: e.label || host || `Server ${i + 1}`, badge: 'LIVE', url: e.url };
    }).filter(Boolean);
    // Hardcoded fallbacks (TMDB-id based) fill gaps the bridge didn't list.
    const fallback = buildEmbeds(embedTmdbId, isTV, season, episode).filter((s) => {
      try {
        const host = new URL(s.url).hostname.replace(/^www\./, '');
        if (seen.has(host)) return false;
        seen.add(host);
        return true;
      } catch (_) { return true; }
    });
    return [...liveServers, ...fallback];
  }, [data?.embeds, embedTmdbId, isTV, season, episode]);

  const fsToggle = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) fsToggle(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const changeSeason = (s) => navigate(`/play/${type}/${id}?netmirror=${isNetMirror}${title ? `&expectedTitle=${encodeURIComponent(title)}` : ''}${language ? `&language=${encodeURIComponent(language)}` : ''}${adult ? '&adult=true' : ''}&season=${s}&episode=1`);
  const changeEpisode = (e) => navigate(`/play/${type}/${id}?netmirror=${isNetMirror}${title ? `&expectedTitle=${encodeURIComponent(title)}` : ''}${language ? `&language=${encodeURIComponent(language)}` : ''}${adult ? '&adult=true' : ''}&season=${season}&episode=${e}`);

  // Prefetch the NEXT episode while this one plays, so advancing feels
  // instant (warms the backend lookup + CDN edge on the server side).
  const prefetchNext = () => {
    if (!isTV || !episodes.length) return;
    const hasNext = episodes.some((ep) => ep.episode_number === episode + 1);
    if (!hasNext) return;
    resolveNetMirrorStream({
      id, type: 'tv', season, episode: episode + 1, language,
      isNetMirror, title: expectedTitle || title,
    }).catch(() => {});
  };

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="relative z-10 flex items-center gap-3 px-5 py-3">
        <button onClick={() => navigate(-1)} aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--kz-text-secondary)] hover:text-white hover:bg-white/[0.06] kz-focus-ring">
          <ArrowLeft size={20} />
        </button>
        <p className="kz-display truncate text-[15px] font-semibold text-white">{title || 'Now Playing'}</p>
        <button onClick={() => setShowParty((s) => !s)} aria-label="Watch party" title="Watch party"
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors kz-focus-ring ${showParty ? 'nm-active-chip' : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] hover:text-white'}`}>
          <Users size={15} weight={showParty ? 'fill' : 'regular'} /> Party
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="px-5 pb-5">
          <div ref={containerRef} className="relative aspect-video w-full overflow-hidden rounded-xl bg-black nm-player-safe"
               style={{ border: '1px solid var(--kz-border)', maxHeight: '78vh', marginInline: 'auto' }}>
            {ext ? (
               <iframe src={ext.url} title={ext.label} className="h-[70vh] w-full bg-black"
                       allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-read; clipboard-write" allowFullScreen referrerPolicy="origin" />
            ) : (
              // Unmount the player on error: a dead Artplayer chrome bleeding
              // through the error card reads as two broken players at once.
              // Retry remounts via the attempt-keyed key below.
              data && status !== 'error' && (
                <NetMirrorPlayer
                  key={`${id}-${attempt}-${season}-${episode}`}
                  sources={data.sources}
                  subtitles={data.subtitles}
                  title={title || data.title}
                  hlsMode={data.isHls || false}
                  onToggleFullscreen={fsToggle}
                  onReady={() => { setStatus('ready'); prefetchNext(); }}
                  onTimeUpdate={({ currentTime }) => {
                    const now = Date.now();
                    if (now - lastPartyTick.current < 500) return;
                    lastPartyTick.current = now;
                    setPartyTime(currentTime || 0);
                    const v = containerRef.current?.querySelector('video');
                    if (v) setPartyPlaying(!v.paused);
                  }}
                  onError={(reason) => { setStatus('error'); if (reason) setErrMsg(reason); }}
                />
              )
            )}
            {!ext && status === 'loading' && (
              <div className="absolute inset-0 grid place-items-center" style={{ background: 'linear-gradient(135deg, var(--kz-surface-1), #000 70%)' }}>
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                  <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/15" style={{ borderTopColor: 'var(--kz-accent)' }} />
                  <div>
                    <p className="text-sm font-medium text-white">{slowLoad ? 'Still working — trying alternate sources…' : 'Resolving stream…'}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--kz-text-muted)' }}>{title || 'Finding the best source for this title'}</p>
                  </div>
                </div>
              </div>
            )}
            {!ext && status === 'error' && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-4 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: 'rgba(248,113,113,0.14)', color: 'var(--kz-danger)' }}>
                    <Warning size={24} weight="bold" />
                  </span>
                  <div>
                    <p className="kz-display text-lg font-semibold text-white">Stream unavailable</p>
                    <p className="mt-1 max-w-sm text-sm" style={{ color: 'var(--kz-text-muted)' }}>{friendlyStreamError(errMsg)}</p>
                  </div>
                  <button onClick={() => setAttempt((a) => a + 1)} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold" style={{ background: 'var(--kz-accent)', color: 'var(--kz-on-accent, #fff)' }}>
                    <ArrowClockwise size={17} weight="bold" /> Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Language dubs available without leaving NetMirror */}
        {languages.length > 1 && (
          <div className="border-t border-white/[0.06] px-5 py-4">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">Languages</div>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <button key={l.id} onClick={() => navigate(`/play/${type}/${l.id}?netmirror=true&expectedTitle=${encodeURIComponent(title)}${isTV ? `&season=${season}&episode=${episode}` : ''}`)}
                        className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--kz-text-secondary)] transition-colors hover:border-[var(--kz-accent)] hover:text-white">
                  {l.language || 'dub'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Servers (minimizable) */}
        {serverList.length > 0 && (
          <div className="border-t border-white/[0.06] px-5 py-4">
            <button onClick={() => setSrvOpen((o) => !o)} aria-expanded={srvOpen}
              className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 kz-focus-ring">
              <Lightning size={14} /> Servers
              <CaretDown size={12} weight="bold" style={{ transform: srvOpen ? 'none' : 'rotate(-90deg)' }} />
            </button>
            {srvOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setExt(null)} className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${!ext ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200' : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'}`}>NetMirror</button>
                {serverList.map((srv) => (
                  <button key={srv.key} onClick={() => setExt({ label: srv.label, url: srv.url })}
                          className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${ext?.label === srv.label ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-200' : 'border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:text-white'}`}>
                    {srv.label} <span className="rounded bg-black/30 px-1 text-[9px] font-black opacity-70">{srv.badge}</span>
                  </button>
                ))}
                {ext && <button onClick={() => setExt(null)} className="text-[11px] text-zinc-500 underline hover:text-white">back to NetMirror</button>}
              </div>
            )}
          </div>
        )}

        {/* TV season / episode picker — compact bar. The full episode list
            loads in the background (for counts/prefetch); the UI stays one row. */}
        {isTV && seasons.length > 0 && (
          <div className="border-t border-white/[0.06] px-5 py-4">
            <button onClick={() => setEpOpen((o) => !o)} aria-expanded={epOpen}
              className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-500 kz-focus-ring">
              <ListBullets size={14} /> Episodes · S{season} E{episode}
              <CaretDown size={12} weight="bold" style={{ transform: epOpen ? 'none' : 'rotate(-90deg)' }} />
            </button>
            {epOpen && (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {seasons.filter(s => s.season_number > 0).map((s) => (
                    <button key={s.season_number} onClick={() => changeSeason(s.season_number)}
                            className={`rounded-lg border px-3 py-1 text-[11px] font-bold ${season === s.season_number ? 'nm-active-chip' : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'}`}>S{s.season_number}</button>
                  ))}
                </div>
                {episodes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => episode > 1 && changeEpisode(episode - 1)} disabled={episode <= 1}
                      aria-label="Previous episode"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition-colors hover:text-white disabled:opacity-30 kz-focus-ring">
                      <CaretLeft size={16} weight="bold" />
                    </button>
                    <select value={episode} onChange={(e) => changeEpisode(Number(e.target.value))} aria-label="Choose episode"
                      className="kz-select h-9 min-w-0 flex-1 text-sm font-medium sm:max-w-xs kz-focus-ring">
                      {episodes.map((ep) => (
                        <option key={ep.id} value={ep.episode_number}>
                          E{ep.episode_number}{ep.name ? ` — ${ep.name}` : ''}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => changeEpisode(episode + 1)} disabled={episode >= Math.max(...episodes.map((e) => e.episode_number))}
                      aria-label="Next episode"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition-colors hover:text-white disabled:opacity-30 kz-focus-ring">
                      <CaretRight size={16} weight="bold" />
                    </button>
                    <span className="text-[11px] text-zinc-500">{episodes.length} episodes</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* More Like This */}
        {recs.length > 0 && (
          <div className="border-t border-white/[0.06] px-5 py-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-400">More Like This</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recs.map((it, idx) => <MediaCard key={`${it.id}-${it.media_type || ''}-${idx}`} item={it} />)}
            </div>
          </div>
        )}
        </div>

        {/* Watch Party — floating slide-over card, same as the web app */}
        {showParty && (
          <WatchPartyPanel
            isOpen={showParty}
              onClose={() => setShowParty(false)}
              onOpen={() => setShowParty(true)}
              currentTime={partyTime}
              isPlaying={partyPlaying}
              mediaTitle={title || 'Video'}
              mediaId={id}
              mediaType={type}
              season={season}
              episode={episode}
              partyCodeFromUrl={sp.get('party') || ''}
              onRemoteSync={(data) => {
                if (data.mediaInfo && data.mediaInfo.mediaId && (String(data.mediaInfo.mediaId) !== String(id) || data.mediaInfo.season !== season || data.mediaInfo.episode !== episode)) {
                  if (partyNavRef.current) return;
                  partyNavRef.current = true;
                  navigate(`/play/${data.mediaInfo.mediaType || type}/${data.mediaInfo.mediaId}?netmirror=${isNetMirror}&party=${watchParty.roomId || sp.get('party') || ''}`);
                  setTimeout(() => { partyNavRef.current = false; }, 3000);
                  return;
                }
                const video = containerRef.current?.querySelector('video');
                if (video) {
                  let target = data.currentTime;
                  if (typeof target === 'number') {
                    if (data.state === 'playing' && data.sentAt) target += Math.max(0, (Date.now() - data.sentAt) / 1000);
                    if (Math.abs(video.currentTime - target) > 1.5) video.currentTime = target;
                  }
                  if (data.state === 'playing' && video.paused) video.play().catch(() => {});
                  if (data.state === 'paused' && !video.paused) video.pause();
                }
              }}
              onRemoteSeek={(data) => {
                const video = containerRef.current?.querySelector('video');
                if (video && typeof data.currentTime === 'number') video.currentTime = data.currentTime;
              }}
              onRemoteMediaChange={(data) => {
                if (data.mediaId && String(data.mediaId) !== String(id)) {
                  if (partyNavRef.current) return;
                  partyNavRef.current = true;
                  navigate(`/play/${data.mediaType || type}/${data.mediaId}?netmirror=${isNetMirror}&party=${watchParty.roomId || sp.get('party') || ''}`);
                  setTimeout(() => { partyNavRef.current = false; }, 3000);
                }
              }}
          />
        )}
      </div>
    </div>
  );
}
