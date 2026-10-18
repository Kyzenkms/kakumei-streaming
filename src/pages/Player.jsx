import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { resolveNetMirrorStream } from '../services/api';
import { attachAdultScripts, triggerAdultAd } from '../services/adManager';
import { getAnimeEmbed, ANIME_SERVERS } from '../services/animeSource';
import { getCached, setCached, cacheKey } from '../services/streamCache';
import { resolveIdentity, resolveAnimeSeasons, pickSeasonEntry } from '../services/titleIdentity';
import { buildServerList } from '../services/providers';
import { useParams, useNavigate } from 'react-router-dom';
import SeoHead, { buildMovieSchema } from '../components/SeoHead';
import NetMirrorPlayer from '../components/NetMirrorPlayer';
import WatchPartyPanel from '../components/WatchPartyPanel';
import { watchParty } from '../services/watchparty';
import {
  getDetails,
  getSeasons,
  getEpisodes,
  getRecommendations,
  getNetmirrorLanguages,
  tmdbSearchByTitle,
  tmdbGetDetails,
  API_CONFIG,
} from '../services/api';
import {
  ChevronLeft,
  Loader2,
  RefreshCw,
  Share2,
  SkipForward,
  Info,
  Bookmark,
  BookmarkCheck,
  Maximize,
  Star,
  Clock,
  Calendar,
  X,
  Heart,
  Play,
  Users,
  Globe,
  ThumbsUp,
  Film,
  Moon,
  Layers,
  Wifi,
  ChevronRight,
  Zap,
  Camera,
} from 'lucide-react';
import { MediaCard } from '../components/MediaGrid';
import { useToast } from '../components/Toast';

const PROVIDERS = [...API_CONFIG.PROVIDERS].sort((a, b) => a.priority - b.priority);

// ── Memoized episode card (avoids re-render on every watchTime tick) ──
const EpisodeCard = memo(({ ep, isCurrent, stillUrl, onClick, unavailable }) => (  <button
    onClick={unavailable ? undefined : onClick}
    disabled={unavailable}
    title={unavailable ? 'No stream available for this episode' : undefined}
    className={`group relative snap-start shrink-0 w-[140px] sm:w-[180px] text-left transition-all duration-200 rounded-xl overflow-hidden border ${
      unavailable
        ? 'border-white/5 opacity-40 cursor-not-allowed'
        : isCurrent
          ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)] ring-1 ring-purple-500'
          : 'border-white/5 hover:border-white/20'
    }`}
  >
    <div className="aspect-video relative overflow-hidden bg-zinc-900">
      {stillUrl ? (
        <img
          src={stillUrl}
          alt={ep.name}
          loading="lazy"
          className={`w-full h-full object-cover transition-transform duration-500 ${isCurrent ? 'scale-105' : 'group-hover:scale-110'}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-zinc-700 font-bold text-xs uppercase">No Image</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      {unavailable && (
        <span className="absolute top-1.5 right-1.5 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">N/A</span>
      )}
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 bg-black/40'}`}>
        {isCurrent ? (
          <div className="bg-purple-500 text-white rounded-full p-2 shadow-[0_0_15px_rgba(168,85,247,0.5)]">
            <Play size={14} fill="currentColor" className="ml-0.5" />
          </div>
        ) : (
          <div className="bg-white/20 backdrop-blur-sm text-white rounded-full p-2 border border-white/30">
            <Play size={14} fill="currentColor" className="ml-0.5" />
          </div>
        )}
      </div>
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between">
        <span className="text-[10px] font-black text-white px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md">EP {ep.episode_number}</span>
        {ep.runtime > 0 && <span className="text-[9px] font-bold text-white/70">{ep.runtime}m</span>}
      </div>
    </div>
    <div className={`p-2.5 sm:p-3 bg-zinc-950 ${isCurrent ? 'bg-purple-500/10' : ''}`}>
      {/* Not a heading — it's a label inside a button. Using <h4> after the page
          <h1> skipped heading levels and broke the document outline. */}
      <span className={`block text-xs sm:text-sm font-bold line-clamp-2 leading-snug min-h-[2.4em] ${isCurrent ? 'text-purple-400' : 'text-zinc-200 group-hover:text-white'}`} title={ep.name || `Episode ${ep.episode_number}`}>
        {ep.name || `Episode ${ep.episode_number}`}
      </span>
    </div>
  </button>
));

export default function Player() {
  const params = useParams();
  return <PlayerScreen key={`${params.type}-${params.id}`} />;
}

function PlayerScreen() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const isNetMirrorId = searchParams.get('netmirror') === 'true';
  // Desktop shell forges the whitelisted Referer natively, so NetMirror's OWN
  // player (our ArtPlayer streaming the locked bcdnxw CDN) works here — unlike
  // the web build, which must fall back to embeds. Default to our own player on
  // desktop for every title.
  const IS_DESKTOP = typeof window !== 'undefined' && !!window.kakumei?.isDesktop;
  const iframeRef = useRef(null);
  const playerContainerRef = useRef(null);
  const watchTimeRef = useRef(0); // ref instead of state — no re-renders
  const partyNavRef = useRef(false); // guards party media-change navigate loop
  const nextEpTimerRef = useRef(null);

  const [media, setMedia] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [currentSource, setSource] = useState((isNetMirrorId || IS_DESKTOP) ? 'NETMIRROR_M1' : (PROVIDERS[0]?.key ?? 'VIDEASY'));
  // Restore season/episode from the URL so a reload keeps your place instead of
  // silently dropping back to S1:E1.
  const urlSeason = Number(searchParams.get('s'));
  const urlEpisode = Number(searchParams.get('ep'));
  const [currentSeason, setSeason] = useState(Number.isFinite(urlSeason) && urlSeason > 0 ? urlSeason : 1);
  const [currentEpisode, setEpisode] = useState(Number.isFinite(urlEpisode) && urlEpisode > 0 ? urlEpisode : 1);
  // Used once, by loadEpisodesFor, so the initial season load keeps the episode
  // from the URL instead of snapping back to the season's first episode.
  const restoredEpRef = useRef(Number.isFinite(urlEpisode) && urlEpisode > 0 ? urlEpisode : null);
  const restoredSeasonRef = useRef(Number.isFinite(urlSeason) && urlSeason > 0 ? urlSeason : null);
  const prevIdRef = useRef(id); // track previous ID to detect title changes
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [netmirrorData, setNetmirrorData] = useState(null);
  // Playback auto-advance: a source can 500 mid-play (ad/image junk that
  // slipped through, dead relay). Walk remaining sources automatically
  // before surfacing an error — this is the in-player half of retry logic.
  const nmFailRef = useRef(new Set());
  // Set once playExternal exists. Lets the built-in player hand off to an
  // external server (miruro / hianime) when every NetMirror source is dead —
  // e.g. the relay pool 429s, which is exactly the failure we kept hitting.
  const fallbackRef = useRef(null);
  const nmDataRef = useRef(null);
  useEffect(() => { nmDataRef.current = netmirrorData; }, [netmirrorData]);
  useEffect(() => { nmFailRef.current = new Set(); }, [id, currentSeason, currentEpisode, currentSource]);

  // Switching to a dubbed entry navigates to a DIFFERENT NetMirror id
  // (/play/{type}/{lang.id}?netmirror=true). Nothing cleared `media`, so the
  // resolve effect kept reusing the PREVIOUS entry's id (mirrorId = media?.id)
  // — it would re-resolve the old language or spin until the watchdog fired,
  // which is why changing dub looked like it hung on the loading screen.
  // Dropping media here forces a clean load for the new id. The content effect
  // depends on [id, isTV, isNetMirrorId] so it immediately reloads.
  useEffect(() => {
    setMedia(null);
    setServerError(false);
  }, [id]);

  // Set by the resolve effect below. Every provider response mints a fresh relay
  // worker (cinemaos-relay.<random>.workers.dev), and those workers rate-limit
  // per host with 429. Advancing through the current source list does NOT escape
  // a 429 because entries usually share one worker — only a NEW resolve gives a
  // new worker. So on exhaustion, re-resolve instead of giving up.
  const resolveFreshRef = useRef(null);

  const handleNmError = useCallback(async () => {
    const data = nmDataRef.current;
    const failed = nmFailRef.current;
    if (data?.url) failed.add(data.url);
    const next = (data?.sources || []).find(s => s?.url && !failed.has(s.url));
    if (next) {
      console.warn('[Player] Source failed, auto-advancing to next:', next.quality || next.url.slice(0, 60));
      setPlayerLoading(true);
      setServerError(false);
      setNetmirrorData({ ...data, url: next.url, quality: next.quality || 'Auto' });
      return;
    }

    // Exhausted (typically 429 from an overloaded relay worker) — re-resolve for
    // a brand new worker rather than showing "Stream unavailable".
    const retry = resolveFreshRef.current;
    if (retry) {
      console.warn('[Player] all sources failed — re-resolving for a fresh relay worker');
      setPlayerLoading(true);
      setServerError(false);
      const ok = await retry();
      if (ok) return;
    }

    // Hand off to an external server before giving up. NetMirror's relays 429
    // routinely, and miruro/hianime both stream reliably — far better than a
    // dead "Stream unavailable" screen.
    const fb = fallbackRef.current;
    if (fb) {
      const switched = await fb();
      if (switched) return;
    }

    console.warn('Native playback failed.');
    setServerError(true);
    setPlayerLoading(false);
  }, []);
  const [playerLoading, setPlayerLoading] = useState(true);

  // ── Anime: hianime (AniList) engine ──
  // Only ever used for the ORIGINAL / Japanese (Sub) entry. Dubs stay on
  // NetMirror — hianime's `dub` is English only and it cannot tell us whether
  // an entry is Hindi/Tamil/etc, so we never ask it to.
  const [activeEngine, setActiveEngine] = useState('netmirror');
  const [anilistId, setAnilistId] = useState(null);
  const [animeAudio, setAnimeAudio] = useState('sub');
  const [animeServer, setAnimeServer] = useState('tryembed');
  const animeEmbed = useMemo(
    () => getAnimeEmbed(anilistId, currentEpisode, animeAudio, animeServer),
    [anilistId, currentEpisode, animeAudio, animeServer]
  );
  const [iframeKey, setIframeKey] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [recs, setRecs] = useState([]);
  const [languages, setLanguages] = useState([]);

  // Episodes proven to have no stream. Dubs lag the sub release, so a season
  // can list 24 episodes while only 12 are actually dubbed — the rest are
  // "dummy" entries that dump the user into a dead player. Discovered lazily
  // on failure, remembered for the session, and skipped by Next Ep.
  // Episode availability is METADATA-based, not failure-based. An episode is
  // "N/A" only when the season metadata doesn't list it (e.g. a sparse allEp
  // grouping). A transient stream failure NEVER marks an episode N/A — that
  // used to grey it out and make Next Ep permanently skip it after a single
  // relay hiccup, killing legitimate retries.
  const isEpNa = useCallback((ep) => {
    if (!episodes || episodes.length === 0) return false; // unknown yet → assume available
    return !episodes.some(e => Number(e.episode_number) === Number(ep));
  }, [episodes]);
  const markEpNa = useCallback(() => {}, []); // no-op: retained so old call sites are safe
  const [titleMismatch, setTitleMismatch] = useState(false);
  // ── New feature state ──
  const [cinemaMode, setCinemaMode] = useState(false);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [showEpDrawer, setShowEpDrawer] = useState(false);
  const [drawerSeason, setDrawerSeason] = useState(1);
  const [drawerEpisodes, setDrawerEpisodes] = useState([]);

  // The episode drawer must follow the season you're actually watching,
  // otherwise it shows season 1 after a reload on a later episode.
  // NOTE: declared after the state above — these setters are const bindings and
  // would throw a TDZ error if referenced earlier in render.
  useEffect(() => { setDrawerSeason(currentSeason); }, [currentSeason]);

  // Seed the drawer's episode list when it OPENS. Bug: drawerEpisodes only got
  // populated when a user clicked a season tab (browseDrawerSeason), so on first
  // open — or on any title with a single season (no tabs to click) — the drawer
  // showed "No episodes found." Seed from the already-loaded `episodes` for the
  // current season; if those haven't loaded yet, fetch the season on demand.
  useEffect(() => {
    if (!showEpDrawer) return;
    setDrawerSeason(currentSeason);
    if (episodes.length > 0) setDrawerEpisodes(episodes);
    else browseDrawerSeason(currentSeason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEpDrawer]);

  // Safety net: if the buffering overlay ever gets stuck (onReady never fires —
  // a stalled relay, a stale cached stream with expired signed URLs, a manifest
  // that 404s), don't sit under a permanent "Buffering" scrim. First try to
  // recover (auto-advance to the next source / re-resolve a fresh relay); if
  // that too fails the error overlay takes over. 25s felt like a hang, so the
  // first recovery attempt fires at 12s and a hard clear backs it up at 22s.
  useEffect(() => {
    if (!playerLoading) return;
    const src = API_CONFIG.SOURCES[currentSource];
    const recover = setTimeout(() => {
      // Only auto-recover NetMirror streams; iframe providers clear via onLoad.
      if (src?.netmirror || src?.vega) {
        console.warn('[Player] loading watchdog: attempting stream recovery');
        handleNmError();
      }
    }, 12000);
    const hardClear = setTimeout(() => {
      setPlayerLoading((still) => {
        if (still) console.warn('[Player] loading watchdog: clearing stuck overlay');
        return false;
      });
    }, 22000);
    return () => { clearTimeout(recover); clearTimeout(hardClear); };
  }, [playerLoading, id, currentSeason, currentEpisode, currentSource, handleNmError]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const [showWatchParty, setShowWatchParty] = useState(() => !!searchParams.get('party'));
  const [inParty, setInParty] = useState(false);
  const [partyCodeFromUrl] = useState(() => searchParams.get('party') || '');
  const [partyPlaying, setPartyPlaying] = useState(false);
  const [isPartyHost, setIsPartyHost] = useState(false);

  useEffect(() => {
    return watchParty.on('status', ({ connected, isHost }) => {
      setInParty(connected);
      setIsPartyHost(!!isHost);
    });
  }, []);

  // ── Host playback sync (accurate) ──
  // Drive sync straight off the <video> element instead of React state/refs.
  // The old path piped currentTime through a ref-backed prop that never
  // re-rendered, so the host broadcast a frozen timestamp and pause/play edges
  // were missed — guests drifted and "pause didn't pause". Here the host emits
  // on the real play/pause/seeked events plus a 3s heartbeat, always reading
  // video.currentTime live.
  useEffect(() => {
    if (!inParty || !isPartyHost) return;
    let video = null;
    let heartbeat = null;
    const mediaInfo = () => ({ mediaId: id, mediaType: type, season: currentSeason, episode: currentEpisode, mediaTitle: media?.title || media?.name || 'Video' });
    const emit = () => {
      if (!video) return;
      watchParty.sendSync(video.paused ? 'paused' : 'playing', video.currentTime, mediaInfo());
    };
    const onPlay = () => emit();
    const onPause = () => emit();
    const onSeeked = () => { if (video) watchParty.sendSeek(video.currentTime); };
    const attach = () => {
      const v = playerContainerRef.current?.querySelector('video');
      if (v && v !== video) {
        if (video) { video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); video.removeEventListener('seeked', onSeeked); }
        video = v;
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('seeked', onSeeked);
        emit();
      }
    };
    // Video element can mount late / swap on quality change — poll briefly to (re)bind.
    const bindTimer = setInterval(attach, 1000);
    attach();
    heartbeat = setInterval(emit, 3000);
    return () => {
      clearInterval(bindTimer);
      clearInterval(heartbeat);
      if (video) { video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); video.removeEventListener('seeked', onSeeked); }
    };
  }, [inParty, isPartyHost, id, type, currentSeason, currentEpisode, media, netmirrorData]);

    const [nextEpCountdown, setNextEpCountdown] = useState(null);
  const [autoPlayNext, setAutoPlayNext] = useState(() => localStorage.getItem('autoplay_next') !== 'false');

  const toggleAutoPlay = () => {
    setAutoPlayNext(prev => {
      const next = !prev;
      localStorage.setItem('autoplay_next', String(next));
      return next;
    });
  }; // null or number


  const isTV = type === 'tv' || seasons.length > 0 || (media && (media.isTV || media.media_type === 'tv')) || false;
  // Keep ?s=&ep= in the URL so reloading (or sharing) lands on the same episode.
  // Declared here because it depends on isTV, which is defined above.
  useEffect(() => {
    if (!isTV) return;
    const params = new URLSearchParams(window.location.search);
    if (Number(params.get('s')) === currentSeason && Number(params.get('ep')) === currentEpisode) return;
    params.set('s', String(currentSeason));
    params.set('ep', String(currentEpisode));
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [isTV, currentSeason, currentEpisode]);

  const isAnime = useMemo(() => {
    if (!media) return false;
    const g = media.genres || [];
    // TMDB supplies genre id 16 (Animation). NetMirror content is mapped as
    // `{ id: 0, name: "Animation" }` and has NO original_language, so the old
    // check (`g.id === 16 && original_language === 'ja'`) could never be true
    // for NetMirror titles — meaning anime never reached the hianime path.
    const byId = g.some(x => Number(x.id) === 16);
    const byName = g.some(x => /animation|anime/i.test(String(x.name || '')));
    return byId || byName;
  }, [media]);

  // Which language is the CURRENT NetMirror entry? Answered from NetMirror's own
  // languages list (each language is a separate NetMirror catalog entry), never
  // by asking hianime — it has no idea.
  const currentLanguage = useMemo(() => {
    const hit = (languages || []).find(l => String(l.id) === String(id));
    return hit && hit.language ? String(hit.language).toLowerCase() : 'original';
  }, [languages, id]);

  // hianime is only ever a candidate for the sub/original entry.
  const isAnimeSubEntry = !!isAnime && (currentLanguage === 'original' || currentLanguage === 'japanese');

  // Remember the original (sub) entry id so a user on a dub can get back to it.
  const originalIdRef = useRef(null);
  useEffect(() => {
    if (isAnimeSubEntry) originalIdRef.current = String(id);
  }, [isAnimeSubEntry, id]);

  // Any change of title/episode resets to NetMirror first; hianime is a fallback.
  useEffect(() => { setActiveEngine('netmirror'); }, [id, currentSeason, currentEpisode]);

  // Derived data
  const provider = useMemo(
    () => API_CONFIG.SOURCES[currentSource],
    [currentSource]
  );
  // Extract the year from ANY date format. NetMirror returns "Sep 28,2023",
  // so a naive .slice(0,4) yields "Sep " and the year guard downstream silently
  // stops working — which made identity resolve to the wrong same-named work.
  const releaseYear = useMemo(() => {
    const raw = media?.release_date || media?.first_air_date || '';
    const m = String(raw).match(/(19|20)\d{2}/);
    return m ? m[0] : '';
  }, [media]);

  // Canonical id resolution. External providers key off different ids —
  // hianime and miruro both need the ANILIST id, our own paths use TMDB. A
  // title alone is ambiguous (see "Reborn"), so this disambiguates on year and
  // gives every downstream server one trusted pair of ids.
  const [identity, setIdentity] = useState(null);
  useEffect(() => {
    if (!media) return;
    let cancelled = false;
    resolveIdentity({ title: media.title || media.name, year: releaseYear, isTV })
      .then(v => { if (!cancelled) setIdentity(v); })
      .catch(() => { if (!cancelled) setIdentity(null); });
    return () => { cancelled = true; };
  }, [media, releaseYear, isTV]);

  // Split-cour anime: AniList keeps ONE ENTRY PER COUR, each restarting at
  // episode 1, while NetMirror keeps one grouped title with real per-season
  // counts. Pull the whole franchise so season N can be mapped to the right
  // anilistId — otherwise asking an external server for "S2E1" would silently
  // return cour 1 episode 1.
  const [seasonEntries, setSeasonEntries] = useState([]);
  useEffect(() => {
    if (!identity?.isAnime || !isTV) { setSeasonEntries([]); return; }
    let cancelled = false;
    resolveAnimeSeasons({ title: media?.title || media?.name, year: releaseYear })
      .then(list => { if (!cancelled) setSeasonEntries(list || []); })
      .catch(() => { if (!cancelled) setSeasonEntries([]); });
    return () => { cancelled = true; };
  }, [identity?.isAnime, isTV, media, releaseYear]);

  // ── external servers ─────────────────────────────────────────────────────
  // Registry-driven: providers.js decides what is available for this title,
  // this just tracks which one is active and how to get its URL.
  const [extServer, setExtServer] = useState(null);
  const [extUrl, setExtUrl] = useState(null);
  const [extLoading, setExtLoading] = useState(false);
  // Subtitle tracks for the active external server ([{url,label,lang}]).
  const [extSubs, setExtSubs] = useState([]);

  // The backup-server notice used to sit on screen forever. Show it briefly,
  // then fade out — re-shown whenever the source/episode changes.
  const [noticeVisible, setNoticeVisible] = useState(true);
  useEffect(() => {
    setNoticeVisible(true);
    const t = setTimeout(() => setNoticeVisible(false), 6000);
    return () => clearTimeout(t);
  }, [currentSource, id, currentSeason, currentEpisode]);

  // Direct stream manifests must go through ArtPlayer + hls.js; only whole
  // player pages (embeds) belong in an iframe.
  const isHlsUrl = (u) => typeof u === 'string' && /\.m3u8(\?|$)/i.test(u);

  // Some CDNs enforce an ORIGIN allowlist and 403 our domain — for both the
  // manifest AND the segments. A browser must send Origin on XHR/fetch and
  // cannot forge it, so those have to be relayed. CORS-open hosts are left
  // alone so the browser streams them DIRECTLY and we use zero bandwidth.
  // The relay also rewrites manifest segment URLs.
  const GATED_HOST = /(^|\.)(watami\.win|keeply\.top)$/i;
  const relayIfGated = (u) => {
    try {
      return GATED_HOST.test(new URL(u).hostname)
        ? `/proxy/stream?url=${encodeURIComponent(u)}`
        : u;
    } catch { return u; }
  };

  const playExternal = useCallback(async (srv) => {
    if (!identity) return;
    setExtServer(srv.key);
    setExtUrl(null);
    setExtSubs([]);

    // Plain embed — url is known up front.
    if (srv.embedUrl) { setExtUrl(srv.embedUrl); return; }

    // hianime — built locally from the anilistId.
    if (srv.kind === 'anime' && identity.anilistId) {
      setExtUrl(getAnimeEmbed(identity.anilistId, currentEpisode, animeAudio, srv.host));
      return;
    }

    // NetMirror's own player — we sign the watchbox URL server-side and iframe
    // it. Their player runs on their origin, sends the right Referer, and the
    // CDN streams straight to the browser.
    if (srv.kind === 'nmplayer') {
      setExtLoading(true);
      try {
        const qs = `id=${id}&type=${isTV ? 'tv' : 'movie'}&season=${currentSeason}&episode=${currentEpisode}`;
        const r = await fetch(`/api/netmirror/player?${qs}`);
        const j = await r.json();
        if (j.url) setExtUrl(j.url);
      } catch { /* leave null -> falls back to the built-in player */ }
      setExtLoading(false);
      return;
    }

    // miruro — needs a server-side harvest (Cloudflare blocks the browser).
    if (srv.kind === 'miruro' && identity.anilistId) {
      setExtLoading(true);
      try {
        const qs = `anilistId=${identity.anilistId}&slug=${encodeURIComponent(identity.slug || '')}&ep=${currentEpisode}&server=${srv.server}`;
        const r = await fetch(`/api/miruro/token?${qs}`);
        const j = await r.json();
        if (j.url) {
          setExtUrl(relayIfGated(j.url));
          // miruro ships subs as separate files; hand them to our ArtPlayer,
          // which renders <track> natively (with styling + offset controls).
          if (Array.isArray(j.subs) && j.subs.length) {
            // Subs are tiny text files — always proxy them. Their CDNs don't
            // send CORS headers, so a direct <track> fetch fails; the proxy
            // serves them CORS-open. Streams stay direct (never proxy video).
            const proxied = j.subs.map((u, i) => ({
              url: `/api/subtitle?url=${encodeURIComponent(u)}`,
              label: 'Sub ' + (i + 1),
              lang: 'en',
            }));
            setExtSubs(proxied);
          }
        }
      } catch { /* leave extUrl null -> falls back to netmirror */ }
      setExtLoading(false);
    }
  }, [identity, currentEpisode, animeAudio]);

  const serverList = useMemo(
    () => buildServerList({ identity, isTV, season: currentSeason, episode: currentEpisode, audio: animeAudio, isNetMirror: isNetMirrorId }),
    [identity, isTV, currentSeason, currentEpisode, animeAudio, isNetMirrorId]
  );

  // Fall back to an external server when the built-in player exhausts its
  // sources. Prefer miruro (CORS-direct, not IP-bound), then hianime, then any
  // embed — all of which we verified working.
  useEffect(() => {
    fallbackRef.current = async () => {
      if (extServer) return false; // already handed off
      const srv = serverList.find(s => s.kind === 'miruro')
        || serverList.find(s => s.kind === 'anime')
        || serverList.find(s => s.kind === 'embed');
      if (!srv) return false;
      console.warn('[Player] built-in sources exhausted — falling back to', srv.label);
      setPlayerLoading(true);
      setServerError(false);
      await playExternal(srv);
      return true;
    };
    return () => { fallbackRef.current = null; };
  }, [serverList, extServer, playExternal]);

  // NOTE: do NOT auto-select the NetMirror iframe. Their watchbox server
  // enforces a Referer ALLOWLIST — their own origins get 200, ours get 502,
  // and a missing referer gets a 168-byte stub. So the player renders black
  // when framed from here; a browser-level Referer can't be replicated from
  // JS. Kept as a manual option only, in case they relax it.

  // Feed external servers the anilistId for the CURRENT season.
  useEffect(() => {
    if (!identity) return;
    if (isTV && seasonEntries.length > 0) {
      const seasonInfo = seasons.find(s => s.season_number === currentSeason);
      const hit = pickSeasonEntry(seasonEntries, currentSeason, seasonInfo?.episode_count || 0);
      // No confident match -> no external server, rather than the wrong episode.
      setAnilistId(hit ? hit.id : null);
      return;
    }
    setAnilistId(identity.anilistId || null);
  }, [identity, seasonEntries, currentSeason, seasons, isTV]);
  const episodeName = isTV && episodes[currentEpisode - 1]?.name;
  const rating = media?.vote_average ? Number(media.vote_average).toFixed(1) : null;
  const runtime = media?.runtime
    ? `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m`
    : null;
  const backdropUrl = media?.backdrop_path
    ? (media.backdrop_path.startsWith('http') ? media.backdrop_path : `${API_CONFIG.BACKDROP_URL}${media.backdrop_path}`)
    : null;
  const posterUrl = media?.poster_path
    ? (media.poster_path.startsWith('http') ? media.poster_path : `${API_CONFIG.IMG_URL_W500}${media.poster_path}`)
    : null;
  const trailer = useMemo(
    () => media?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube'),
    [media]
  );
  const cast = useMemo(
    () => (media?.credits?.cast || []).slice(0, 12),
    [media]
  );

  // ── Callbacks (stable) ──
// ── Quick Screenshot Function (captures video frame + subtitles) ──
  const takeScreenshot = useCallback(() => {
    try {
      const container = playerContainerRef.current;
      const video = container?.querySelector('video');
      if (!video) {
        toast('Video stream not ready for screenshot', { type: 'error' });
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw subtitle text if visible
      const subEl = container?.querySelector('#nm-subtitle, .nm-subtitle-display');
      if (subEl && subEl.style.display !== 'none' && subEl.innerText.trim()) {
        ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000000';
        const lines = subEl.innerText.split('\n');
        lines.forEach((line, idx) => {
          const y = canvas.height - 60 - (lines.length - 1 - idx) * 44;
          ctx.strokeText(line, canvas.width / 2, y);
          ctx.fillText(line, canvas.width / 2, y);
        });
      }

      // Trigger shutter flash
      const flash = document.createElement('div');
      flash.style.cssText = 'position:absolute;inset:0;background:#ffffff;z-index:999;opacity:0.8;transition:opacity 0.3s ease;pointer-events:none;';
      container.appendChild(flash);
      setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 300);
      }, 50);

      // Download snapshot
      canvas.toBlob((blob) => {
        if (!blob) {
          toast('Failed to capture frame', { type: 'error' });
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const titleSafe = (media?.title || media?.name || 'kakumei_stream').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const curSec = Math.floor(video.currentTime || 0);
        a.href = url;
        a.download = `${titleSafe}_snapshot_${curSec}s.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('📸 Screenshot captured & downloaded!', { type: 'success' });
      }, 'image/png');

    } catch (err) {
      console.error('Screenshot error:', err);
      toast('Screenshot capture failed (CORS stream restriction)', { type: 'error' });
    }
  }, [media, toast]);
  const getNextProvider = useCallback(() => {
    const currentIndex = PROVIDERS.findIndex(p => p.key === currentSource);
    return PROVIDERS[(currentIndex + 1) % PROVIDERS.length]?.key || PROVIDERS[0]?.key;
  }, [currentSource]);

  const switchSource = useCallback((key) => {
    setSource(key);
    setLoading(true);
    setPlayerLoading(true);
    setServerError(false);
  }, []);

  const tryNextServer = useCallback(() => switchSource(getNextProvider()), [getNextProvider, switchSource]);

  const changeEpisode = useCallback((episodeNumber) => {
    // Clamp to valid range for current season. For NetMirror allEp groupings the
    // list of real episodes (episodes state) is authoritative, not episode_count.
    const maxEp = isNetMirrorId
      ? (episodes.length || seasons.find(s => s.season_number === currentSeason)?.episode_count || 99)
      : (episodes.length || 99);
    const clamped = Math.max(1, Math.min(episodeNumber, maxEp));
    // Show the buffering overlay immediately on switch. Previously only the
    // page-level `loading` was set, so the player sat on a stale frame with no
    // spinner — and if onReady never fired, the overlay/controls never returned.
    setPlayerLoading(true);
    setServerError(false);
    // Drop the previous episode's stream so the player can't keep playing the
    // old one (or show its stale duration) while the new one resolves.
    setNetmirrorData(null);
    setEpisode(clamped);
    setLoading(true);
  }, [isNetMirrorId, seasons, currentSeason, episodes.length]);

  const loadEpisodesFor = useCallback((seasonNumber) => {
    setSeason(seasonNumber);
    setLoading(true);
    if (isNetMirrorId) {
      // Build episode list from NetMirror season data, honoring allEp when present.
      // NetMirror treats seasons as groupings — allEp lists the ONLY episodes that
      // exist for that grouping (e.g. Bleach S2 allEp="3,4,5,8,..."), so we must not
      // fabricate a 1..epCount range. Default to the first available episode.
      const seasonInfo = seasons.find(s => s.season_number === seasonNumber);
      const epCount = seasonInfo?.episode_count || 24;
      const allEp = seasonInfo?.allEp;
      const epNumbers = allEp && allEp.trim() ? allEp.split(',').map(n => parseInt(n, 10)).filter(n => n > 0) : [];
      const numbers = epNumbers.length > 0 ? epNumbers : Array.from({ length: epCount }, (_, i) => i + 1);
      // If we're initialising the season the URL asked for, honour its episode on
      // this first pass — otherwise a reload on S2:E3 silently snapped to S2:E1.
      const restored = (restoredSeasonRef.current === seasonNumber && restoredEpRef.current != null)
        ? restoredEpRef.current
        : null;
      restoredEpRef.current = null;
      restoredSeasonRef.current = null;
      const defaultEp = restored != null ? restored : (numbers[0] || 1);
      setEpisode(defaultEp);
      // Try to get TMDB episode thumbnails for this season
      const tmdbId = seasonInfo?.tmdbId;
      if (tmdbId) {
        fetch(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`)
          .then(r => r.json())
          .then(epData => {
            const tmdbEps = epData.episodes || [];
            const eps = numbers.map(n => {
              const tmdbEp = tmdbEps.find(e => e.episode_number === n);
              return {
                episode_number: n,
                name: tmdbEp?.name || `Episode ${n}`,
                still_path: tmdbEp?.still_path || null,
                overview: tmdbEp?.overview || '',
              };
            });
            setEpisodes(eps);
          })
          .catch(() => {
            const eps = numbers.map(n => ({ episode_number: n, name: `Episode ${n}`, still_path: null }));
            setEpisodes(eps);
          });
      } else {
        const eps = numbers.map(n => ({ episode_number: n, name: `Episode ${n}`, still_path: null }));
        setEpisodes(eps);
      }
    } else {
      setEpisode(1);
      getEpisodes(id, seasonNumber).then(setEpisodes);
    }
  }, [id, isNetMirrorId, seasons]);

  // ── Browse season inside Episode Drawer WITHOUT interrupting video stream ──
  const browseDrawerSeason = useCallback((seasonNumber) => {
    setDrawerSeason(seasonNumber);
    if (seasonNumber === currentSeason && episodes.length > 0) {
      setDrawerEpisodes(episodes);
      return;
    }
    setDrawerLoading(true);
    if (isNetMirrorId) {
      const seasonInfo = seasons.find(s => s.season_number === seasonNumber);
      const epCount = seasonInfo?.episode_count || 24;
      const allEp = seasonInfo?.allEp;
      const epNumbers = allEp && allEp.trim() ? allEp.split(',').map(n => parseInt(n, 10)).filter(n => n > 0) : [];
      const numbers = epNumbers.length > 0 ? epNumbers : Array.from({ length: epCount }, (_, i) => i + 1);
      const tmdbId = seasonInfo?.tmdbId;
      if (tmdbId) {
        fetch(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`)
          .then(r => r.json())
          .then(epData => {
            const tmdbEps = epData.episodes || [];
            const eps = numbers.map(n => {
              const tmdbEp = tmdbEps.find(e => e.episode_number === n);
              return {
                episode_number: n,
                name: tmdbEp?.name || `Episode ${n}`,
                still_path: tmdbEp?.still_path || null,
                overview: tmdbEp?.overview || '',
              };
            });
            setDrawerEpisodes(eps);
            setDrawerLoading(false);
          })
          .catch(() => {
            const eps = numbers.map(n => ({ episode_number: n, name: `Episode ${n}`, still_path: null }));
            setDrawerEpisodes(eps);
            setDrawerLoading(false);
          });
      } else {
        const eps = numbers.map(n => ({ episode_number: n, name: `Episode ${n}`, still_path: null }));
        setDrawerEpisodes(eps);
        setDrawerLoading(false);
      }
    } else {
      getEpisodes(id, seasonNumber).then(eps => {
        setDrawerEpisodes(eps || []);
        setDrawerLoading(false);
      }).catch(() => setDrawerLoading(false));
    }
  }, [currentSeason, episodes, isNetMirrorId, seasons, id]);

  const selectDrawerEpisode = useCallback((seasonNumber, episodeNumber) => {
    if (seasonNumber !== currentSeason) {
      setSeason(seasonNumber);
      setEpisodes(drawerEpisodes);
    }
    changeEpisode(episodeNumber);
    setShowEpDrawer(false);
  }, [currentSeason, drawerEpisodes, changeEpisode]);

  const nextEpisode = useCallback(() => {
    // Skip episodes already known to have no stream, so Next Ep doesn't
    // dump the user onto another dead player.
    // Walk the real episode NUMBERS, not the array length: sparse seasons
    // (allEp="1..24,26") have fewer entries than the highest episode number,
    // so an index-based walk would stall before the last episode.
    const idx = episodes.findIndex(e => e.episode_number === currentEpisode);
    for (let i = idx + 1; i < episodes.length; i++) {
      const num = episodes[i].episode_number;
      if (!isEpNa(num)) { changeEpisode(num); return; }
    }
    if (currentSeason < seasons.length) loadEpisodesFor(currentSeason + 1);
  }, [currentEpisode, episodes, currentSeason, seasons.length, loadEpisodesFor, changeEpisode, isEpNa]);

  const prevEpisode = useCallback(() => {
    const idx = episodes.findIndex(e => e.episode_number === currentEpisode);
    for (let i = idx - 1; i >= 0; i--) {
      const num = episodes[i].episode_number;
      if (!isEpNa(num)) { changeEpisode(num); return; }
    }
    if (currentSeason > 1) loadEpisodesFor(currentSeason - 1);
  }, [currentEpisode, episodes, currentSeason, loadEpisodesFor, changeEpisode, isEpNa]);

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(isFs);
      if (!isFs && screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      const el = playerContainerRef.current || document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        setIsFullscreen(true);
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        setIsFullscreen(false);
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      }
    } catch { /* ignore */ }
  }, []);

  const reloadPlayer = useCallback(() => {
    setServerError(false);
    setPlayerLoading(true);
    setIframeKey(k => k + 1);
  }, []);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast?.('🔗 Link copied!', { type: 'success' });
    });
  }, [toast]);

  const toggleBookmark = useCallback(() => {
    const key = `bookmark_${type}_${id}`;
    const newValue = !isBookmarked;
    setIsBookmarked(newValue);
    if (newValue) {
      localStorage.setItem(key, JSON.stringify({ ...media, isTV, timestamp: Date.now() }));
      toast?.('Saved to bookmarks', { type: 'success' });
    } else {
      localStorage.removeItem(key);
      toast?.('Removed from bookmarks', { type: 'info' });
    }
    window.dispatchEvent(new Event('storage'));
  }, [isBookmarked, media, type, id, isTV, toast]);

  const toggleLike = useCallback(() => {
    const key = `like_${type}_${id}`;
    const newValue = !isLiked;
    setIsLiked(newValue);
    if (newValue) localStorage.setItem(key, JSON.stringify({ ...media, isTV, timestamp: Date.now() }));
    else localStorage.removeItem(key);
    window.dispatchEvent(new Event('storage'));
  }, [isLiked, media, type, id, isTV]);

  // ── Effects ──

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case 'f': toggleFullscreen(); break;
        case 'i': setShowInfo(s => !s); break;
        case 'n': tryNextServer(); break;
        case 'c': setCinemaMode(s => !s); break;
        case 'e': if (isTV) setShowEpDrawer(s => !s); break;
        case 'arrowright': if (isTV) nextEpisode(); break;
        case 'arrowleft': if (isTV) prevEpisode(); break;
        case 'escape': setShowInfo(false); setShowEpDrawer(false); setNextEpCountdown(null); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
  

  return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTV, toggleFullscreen, tryNextServer, nextEpisode, prevEpisode]);

  // Bookmark + recent tracking (runs once on mount)
  useEffect(() => {
    if (media) {
      setIsBookmarked(localStorage.getItem(`bookmark_${type}_${id}`) !== null);
      setIsLiked(localStorage.getItem(`like_${type}_${id}`) !== null);
      localStorage.setItem(`recent_${type}_${id}`, JSON.stringify({
        ...media, type, timestamp: Date.now(), progress: 0
      }));
    }
  }, [media, type, id]);

  // Watch time tracker (ref-based — no re-renders!)
  useEffect(() => {
    if (loading || !media) return;
    watchTimeRef.current = 0;
    const interval = setInterval(() => {
      watchTimeRef.current += 1;
      const next = watchTimeRef.current;
      if (next % 10 === 0) {
        let totalSeconds = 120 * 60;
        if (isTV && media.episode_run_time?.[0]) totalSeconds = media.episode_run_time[0] * 60;
        else if (media.runtime) totalSeconds = media.runtime * 60;
        const progress = Math.min(next / totalSeconds, 1);
        localStorage.setItem(`recent_${type}_${id}`, JSON.stringify({
          ...media, type, timestamp: Date.now(), progress, watchTime: next
        }));

        // Next-episode countdown trigger (TV only, when within last 45s)
        if (isTV && totalSeconds > 0 && !nextEpCountdown && currentEpisode < episodes.length) {
          const remaining = totalSeconds - next;
          if (remaining > 0 && remaining <= 45) {
            setNextEpCountdown(Math.round(remaining));
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, media, type, id, isTV]);

  // Fetch media data
  useEffect(() => {
    let cancelled = false;

    const loadNmContent = async () => {
      if (prevIdRef.current !== id) {
        setSeason(1);
        setEpisode(1);
        setEpisodes([]);
        prevIdRef.current = id;
      }

      const fetchNm = async (nmId) => {
        const r = await fetch(`/api/netmirror/content?id=${nmId}&type=${isTV ? 'tv' : 'movie'}`);
        return r.json();
      };

      const params = new URLSearchParams(window.location.search);
      const expectedTitle = params.get('expectedTitle');
      const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. Try the URL ID directly
      let nmData = await fetchNm(id);
      let actualNmId = id;

      // If the user selected a specific NetMirror variant (?netmirror=true), stick to that exact ID
      if (isNetMirrorId && !nmData.error && nmData.id) {
        // Keep selected NetMirror ID exactly as requested
      } else if (!nmData.error && nmData.id && expectedTitle && norm(nmData.title)) {
        const exp = norm(expectedTitle).slice(0, 8);
        const loaded = norm(nmData.title);
        if (exp && !loaded.includes(exp) && !loaded.startsWith(exp)) {
          nmData = { error: true };
        }
      }

      // 2. If that fails, search by title to find the real NetMirror ID
      if (nmData.error || !nmData.id) {
        let searchTitle = expectedTitle || media?.title || media?.name || '';
        if (!searchTitle && type && id) {
          try {
            const tmdbRes = await fetch(`/api/tmdb/${type}/${id}`).then(r => r.json());
            searchTitle = tmdbRes.title || tmdbRes.name || '';
          } catch (e) {}
        }
        if (searchTitle) {
          try {
            const cleanTitle = searchTitle.replace(/\s*\[.*?\]\s*/g, '').replace(/\s*\(.*?\)\s*/g, '').trim();
            const results = await fetch(`/api/netmirror/search?q=${encodeURIComponent(cleanTitle)}`).then(r => r.json());
            const normQ = norm(cleanTitle);
            // Prefer the exact base title (original series) over spin-offs/sequels.
            // "Bleach" must resolve to "Bleach S1-S3", not "Bleach: Thousand-Year Blood War".
            const baseTitle = (t) => norm(t).replace(/\s*S\d+.*$/i, '');
            const scored = (results || []).map(r => {
              const raw = r.title || r.originalTitle || '';
              const b = baseTitle(raw);
              const f = norm(raw);
              let s = 0;
              if (normQ && b === normQ) s += 1000;          // exact base match
              else if (normQ && b.includes(normQ)) s += 600; // franchise base
              else if (normQ && f.includes(normQ)) s += 400; // loose
              if (!normQ.includes('bloodwar') && /blood war/i.test(raw)) s -= 300;
              if (!/\[[a-z]+\]/i.test(raw)) s += 500;       // prefer Original version
              else if (/\[english\]/i.test(raw)) s += 300; // prefer English dub
              else if (/\[hindi\]/i.test(raw)) s += 100;   // prefer Hindi dub
              if (/\[arabic\]|\[indonesian\]/i.test(raw)) s -= 500;
              return { r, s };
            })
              .filter(x => x.s > 0)
              .sort((a, b) => b.s - a.s);
            const match = scored[0]?.r || (results || [])[0];
            if (match) {
              actualNmId = String(match.id);
              nmData = await fetchNm(actualNmId);
              if (!cancelled && actualNmId !== id) {
                window.history.replaceState({}, '', `/play/${type}/${actualNmId}?netmirror=true&expectedTitle=${encodeURIComponent(searchTitle)}`);
              }
            }
          } catch { /* search failed */ }
        }
      }

      if (cancelled) return;

      if (nmData.error || !nmData.id) {
        setMedia({ title: nmData.title || 'Video', name: 'Video', isNetMirror: true });
        return;
      }

      // 3. Validate title (dub language check).
      // Compare BASE titles — strip [Language] tags and "S1-S3" season groupings
      // from BOTH sides. Without this, dub→dub switches falsely tripped the
      // "Dub Not Available" screen: expectedTitle carried the previous entry's
      // tag ("Jujutsu Kaisen [Hindi]") while the new entry read
      // "Jujutsu Kaisen [Telugu]", so neither string contained the other.
      const baseNorm = (t) => (t || '')
        .toLowerCase()
        .replace(/\s*\[[a-z]+\]/gi, '')
        .replace(/\s*s\d+(\s*[-–]\s*s?\d+)*\s*$/i, '')
        .replace(/[^a-z0-9]/g, '');
      const loadedTitle = baseNorm(nmData.title);
      if (expectedTitle && loadedTitle) {
        const expected = baseNorm(expectedTitle);
        if (expected && !loadedTitle.includes(expected) && !expected.includes(loadedTitle)) {
          setTitleMismatch(true);
          setLoading(false);
          return;
        }
      }
      setTitleMismatch(false);

      // 4. Build season/episode data. Movies come back with a placeholder
      // season [{se:0,ep:0}] — keep it out or it flips isTV true and the
      // player renders an Episodes UI + episode grid for a film.
      const nmSeasons = (nmData.season || [])
        .filter(s => s && s.se > 0 && s.ep > 0)
        .map(s => ({
          season_number: s.se,
          episode_count: s.ep,
          name: `Season ${s.se}`,
          allEp: s.allEp || '',
        }));
      setSeasons(nmSeasons.length > 0 ? nmSeasons : []);

      const cleanTitle = (nmData.title || '').replace(/\s*\[.*?\]\s*/g, '').replace(/\s*S\d+.*$/i, '').trim();

      // 5. Enrich with TMDB data (backdrop, poster, episode thumbnails)
      let tmdbData = null;
      let tmdbEpisodes = [];
      try {
        const tmdbResult = await tmdbSearchByTitle(cleanTitle, isTV);
        if (tmdbResult) {
          tmdbData = await tmdbGetDetails(tmdbResult.id, isTV);
          if (cancelled) return;
          if (isTV && tmdbData?.seasons) {
            const mergedSeasons = nmSeasons.map(nmS => {
              const tmdbS = tmdbData.seasons.find(s => s.season_number === nmS.season_number);
              // Store the SERIES id (tmdbResult.id), not the per-season id (tmdbS.id),
              // so /api/tmdb/tv/{id}/season/{n} resolves the right episodes.
              return { ...nmS, tmdbId: tmdbResult?.id, tmdbSeasonId: tmdbS?.id };
            });
            setSeasons(mergedSeasons);
            const tmdbSeason = tmdbData.seasons.find(s => s.season_number === 1);
            if (tmdbSeason?.episode_count) {
              const epRes = await fetch(`/api/tmdb/tv/${tmdbResult.id}/season/1`);
              const epData = await epRes.json();
              tmdbEpisodes = epData.episodes || [];
            }
          }
        }
      } catch { /* TMDB failed, use NetMirror data */ }

      if (cancelled) return;

      // 6. Build episode list.
      // Pick the first season that actually has playable content: prefer a season
      // without an allEp (full 1..ep) or the first season with an allEp list as
      // its first available episode is the demo's default for grouped seasons.
      if (isTV && nmSeasons.length > 0) {
        const first = nmSeasons[0] || {};
        const epCount = first.episode_count || 24;
        const allEp = first.allEp;
        const epNumbers = allEp && allEp.trim() ? allEp.split(',').map(n => parseInt(n, 10)).filter(n => n > 0) : [];
        const numbers = epNumbers.length > 0 ? epNumbers : Array.from({ length: epCount }, (_, i) => i + 1);
        // Honour ?ep= from the URL. Without this, a reload on S2:E3 got clobbered
        // back to the first episode of the first season during content load.
        const restoredEp = restoredEpRef.current;
        restoredEpRef.current = null;
        restoredSeasonRef.current = null;
        setEpisode(restoredEp != null ? restoredEp : (numbers[0] || 1));
        const eps = numbers.map(n => {
          const tmdbEp = tmdbEpisodes.find(e => e.episode_number === n);
          return {
            episode_number: n,
            name: tmdbEp?.name || `Episode ${n}`,
            still_path: tmdbEp?.still_path || null,
            overview: tmdbEp?.overview || '',
            air_date: tmdbEp?.air_date || '',
          };
        });
        setEpisodes(eps);
      }

      // 7. Set media object
      const backdrop = tmdbData?.backdrop_path || nmData.backdrop_path || null;
      const poster = tmdbData?.poster_path || null;
      setMedia({
        id: nmData.id,
        tmdbId: tmdbData?.id || null,
        title: nmData.title,
        name: nmData.title,
        isNetMirror: true,
        poster_path: poster,
        backdrop_path: backdrop,
        release_date: nmData.release_date || tmdbData?.release_date || '',
        overview: tmdbData?.overview || nmData.dis || '',
        vote_average: tmdbData?.vote_average || nmData.vote_average || 0,
        runtime: tmdbData?.runtime || nmData.duration || 0,
        genres: tmdbData?.genres || (nmData.genre || []).map(g => ({ id: 0, name: g })),
        original_language: tmdbData?.original_language || '',
        _nmSeasons: nmSeasons,
      });

      // 8. Fetch languages + recommendations
      // Scope language variants to THIS work (year + type), otherwise a title
      // shared with another film/series drags in the wrong entry's dubs.
      const nmYear = String(nmData?.release_date || '').slice(0, 4);
      getNetmirrorLanguages(cleanTitle, { year: nmYear, type: isTV ? 'tv' : 'movie', id })
        .then(setLanguages).catch(() => setLanguages([]));
      if (tmdbData?.id) {
        try {
          const recRes = await fetch(`/api/tmdb/${isTV ? 'tv' : 'movie'}/${tmdbData.id}/similar`);
          const recData = await recRes.json();
          if (!cancelled) setRecs((recData.results || []).slice(0, 12).map(r => ({ ...r, isTV })));
        } catch {}
      } else if (cleanTitle) {
        fetch(`/api/netmirror/search?q=${encodeURIComponent(cleanTitle)}`)
          .then(r => r.json())
          .then(items => {
            if (!cancelled) setRecs((items || []).filter(i => String(i.id) !== String(actualNmId)).slice(0, 12).map(i => ({ ...i, isTV: i.media_type === 'tv', isNetMirror: true })));
          })
          .catch(() => {});
      }
    };

    if (isNetMirrorId) {
      loadNmContent().catch(() => { if (!cancelled) setMedia({ title: 'Video', name: 'Video', isNetMirror: true }); });
    } else {
      getDetails(id, isTV).then(setMedia);
      getRecommendations(id, isTV).then(setRecs);
      if (isTV) {
        getSeasons(id).then(setSeasons);
        getEpisodes(id, 1).then(setEpisodes);
      }
    }
    return () => { cancelled = true; };
  }, [id, isTV, isNetMirrorId]);

  const isAdultContent = useMemo(() => {
    return new URLSearchParams(location.search).get('adult') === 'true';
  }, [location.search]);

  useEffect(() => {
    if (isAdultContent) {
      const cleanup = attachAdultScripts();
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
  }, [isAdultContent]);

  // ── NetMirror: resolve stream ──
  const NETMIRROR_MIRRORS = [
    { mirror: 0, key: 'NETMIRROR_M1' },
  ];

  useEffect(() => {
    if (!provider?.netmirror || !media) return;

    let cancelled = false;
    setLoading(true);
    setServerError(false);
    setNetmirrorData(null);
    const mirrorTitle = media.title || media.name || '';
    const mirrorIsNetMirror = isNetMirrorId || !!media.isNetMirror;
    // When landing from a recommendation, the URL id is a TMDB id that must be
    // resolved to the real NetMirror id (media.id gets set by loadNmContent).
    // Without this, the backend is queried with a TMDB id + isNetMirror=true and
    // fails ("More Like This" cards would not load).
    const mirrorId = mirrorIsNetMirror && media?.id ? String(media.id) : id;

    // Fast path — we already resolved this exact episode recently, so skip the
    // backend resolve (the thing that makes load times swing between 1s and 40s).
    const ck = cacheKey(mirrorId, currentSeason, currentEpisode, provider.netmirrorMirror ?? 0);
    const cached = getCached(ck);
    if (cached && !cached.failed) {
      setNetmirrorData(cached);
      setPlayerLoading(true);
      setServerError(false);
      setLoading(false);
      return;
    }

    const tryMirrors = async () => {
      // Bridge is flaky per-request (empty shells) — retry the primary id
      // with fresh=1 (bypasses backend read caches) before falling back.
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const attemptResolve = async (params, fresh) => {
        try {
          return await resolveNetMirrorStream({ ...params, fresh });
        } catch { return { success: false }; }
      };
      const baseParams = {
        id: mirrorId,
        type: isTV ? 'tv' : 'movie',
        season: currentSeason,
        episode: currentEpisode,
        mirror: provider.netmirrorMirror ?? 0,
        title: mirrorTitle,
        isNetMirror: mirrorIsNetMirror,
      };
      try {
        let result = await attemptResolve(baseParams, false);
        for (let i = 1; i < 3 && (!result?.success || !result?.sources?.length); i++) {
          if (cancelled) return;
          // Was 2000*i (2s then 4s of pure waiting) which alone added 6s
          // before the title-search fallback even started.
          await sleep(700 * i);
          if (cancelled) return;
          result = await attemptResolve(baseParams, true);
        }

        // Fallback: If initial resolve failed, search NetMirror by title and try original then dub fallbacks
        if ((!result?.success || !result?.sources?.length) && mirrorTitle) {
          const clean = mirrorTitle.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
          try {
            const searchRes = await fetch(`/api/netmirror/search?q=${encodeURIComponent(clean)}`).then(r => r.json());
            const matches = searchRes || [];
            // Try original first, then English dub, then Hindi/other dub variants
            for (const match of matches.slice(0, 4)) {
              if (!match?.id || String(match.id) === String(mirrorId)) continue;
              const retry = await resolveNetMirrorStream({
                id: String(match.id),
                type: isTV ? 'tv' : 'movie',
                season: currentSeason,
                episode: currentEpisode,
                mirror: provider.netmirrorMirror ?? 0,
                title: match.title || mirrorTitle,
                isNetMirror: true,
              });
              if (retry?.success && retry?.sources?.length > 0) {
                result = retry;
                break;
              }
            }
          } catch (err) {}
        }

        if (cancelled) return;
        if (result?.success && result?.sources?.length > 0) {
          setNetmirrorData(result);
          setPlayerLoading(true);
          setServerError(false);
          setLoading(false);
          setCached(ck, result);
          // Prefetch the next episode in the background so "Next Ep" is instant
          // instead of paying another slow resolve.
          if (isTV) {
            const nk = cacheKey(mirrorId, currentSeason, currentEpisode + 1, provider.netmirrorMirror ?? 0);
            if (!getCached(nk)) {
              resolveNetMirrorStream({ ...baseParams, episode: currentEpisode + 1 })
                .then(r => { if (r?.success && r?.sources?.length) setCached(nk, r); })
                .catch(() => {});
            }
          }
          return;
        }
      } catch (e) {
        if (cancelled) return;
      }

      // NetMirror resolution failed.
      // Anime + original/sub entry: hand off to hianime instead of erroring.
      // Anything else (all dubs, movies, non-anime) behaves exactly as before.
      if (!cancelled) {
        // Negative-cache the failure. Titles the provider can't serve currently
        // spend ~44s walking every retry + the title search before returning
        // {success:false,no_sources} — and then paid that again on every
        // revisit. Remembering the miss makes the next attempt instant (so we
        // fall through to the error / hianime immediately). TTL is short (45s)
        // so a title that comes back online still recovers on its own.
        // Short negative-cache only (45s TTL) so an immediate re-click doesn't
        // re-walk the whole slow chain — but it self-heals fast. We deliberately
        // do NOT mark the episode N/A here: a single transient relay failure
        // (429/empty shell) is not proof the episode is missing, and marking it
        // N/A used to grey it out + make Next Ep skip it permanently, killing
        // legitimate retries. N/A is now metadata-based (see isEpNa) — an episode
        // is unavailable only when the season metadata says it doesn't exist.
        setCached(ck, null);

        if (isAnimeSubEntry && anilistId) {
          setActiveEngine('hianime');
          setServerError(false);
          setLoading(false);
          setPlayerLoading(false);
          return;
        }
        setServerError(true);
        setLoading(false);
      }
    };

    tryMirrors();
    return () => { cancelled = true; };
  }, [provider, media, id, isTV, currentSeason, currentEpisode]);

  // Force clear loading after 5s
  useEffect(() => {
    const timeout = setTimeout(() => { if (loading) setLoading(false); }, 5000);
    return () => clearTimeout(timeout);
  }, [loading]);

  // ── Subtitle fallback (OpenSubtitles) ──
  // NetMirror streams sometimes carry NO subtitle tracks (niche anime, some
  // dubs) — "A Girl & Her Guard Dog" is one. When the resolved stream has no
  // subs, pull them from our /api/subs/find bridge (keyless OpenSubtitles) and
  // merge them in so the player's subtitle menu is populated. Keyed off the
  // resolved stream + episode; guarded so it runs once per (id, s, e).
  const subFetchRef = useRef('');
  useEffect(() => {
    if (!netmirrorData || !netmirrorData.success && !netmirrorData.sources?.length) return;
    if (netmirrorData.subtitles && netmirrorData.subtitles.length > 0) return;
    const title = (media?.title || media?.name || '').replace(/\s*\[.*?\]/g, '').replace(/\s*S\d+.*$/i, '').trim();
    if (!title) return;
    const key = `${id}|${currentSeason}|${currentEpisode}`;
    if (subFetchRef.current === key) return;
    subFetchRef.current = key;
    let cancelled = false;
    (async () => {
      try {
        const p = new URLSearchParams({ title, type: isTV ? 'tv' : 'movie', langs: 'en,hi,es,ar,pt,fr,id' });
        if (media?.tmdbId) p.set('tmdb', String(media.tmdbId));
        if (isTV) { p.set('season', String(currentSeason)); p.set('episode', String(currentEpisode)); }
        const subs = await fetch(`/api/netmirror/subs-find?${p.toString()}`).then(r => r.json());
        if (cancelled || !Array.isArray(subs) || subs.length === 0) return;
        setNetmirrorData(prev => {
          if (!prev || (prev.subtitles && prev.subtitles.length > 0)) return prev;
          return { ...prev, subtitles: subs };
        });
      } catch { /* no fallback subs */ }
    })();
    return () => { cancelled = true; };
  }, [netmirrorData, media, id, isTV, currentSeason, currentEpisode]);

  const getUrl = useCallback(() => {
    if (!provider) return '';
    if (provider.netmirror) return netmirrorData?.url || '';
    const fn = isTV ? provider.tv : provider.movie;
    if (typeof fn !== 'function') return '';
    // Prefer the id we RESOLVED (title+year disambiguated) over media.tmdbId,
    // which for NetMirror titles is a loose TMDB-enrichment guess — that's what
    // made videasy load "Bleach (2004)" for a TYBW page.
    const targetTmdbId = identity?.tmdbId || media?.tmdbId || (!isNetMirrorId ? id : null);
    if (!targetTmdbId) return '';
    return fn({ id: targetTmdbId, season: currentSeason, episode: currentEpisode });
  }, [provider, isTV, id, isNetMirrorId, media, identity, currentSeason, currentEpisode, netmirrorData]);

  // ── Loading screen (show poster + backdrop while TMDB fetches) ──
  if (!media) {
    return (
      <div className="flex flex-col min-h-screen bg-[#07080f]">
        <div className="relative w-full h-[45vh] sm:h-[50vh] flex items-end">
          <div className="absolute inset-0 bg-gradient-to-t from-[#07080f] via-[#07080f]/60 to-transparent z-10" />
          <div className="relative z-20 px-4 sm:px-6 md:px-12 lg:px-16 pb-6 max-w-[100rem] mx-auto w-full">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="animate-spin text-purple-500" size={18} />
              <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Loading player...</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  // ── Title mismatch screen (dub not available) ──
  if (titleMismatch) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#07080f]">
        <div className="flex flex-col items-center gap-5 max-w-sm text-center px-6">
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <X size={36} className="text-red-400" />
          </div>
          <h2 className="text-2xl font-black text-white">Dub Not Available</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This title is not available in the selected language. Try switching to another language from the buttons below.
          </p>
          <div className="flex gap-3 mt-2">
            <button onClick={() => navigate(-1)} className="rounded-xl bg-white/10 border border-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/15 transition-all">
              Go Back
            </button>
            <button onClick={() => { setTitleMismatch(false); window.location.reload(); }} className="rounded-xl bg-purple-500 border border-purple-400/30 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-600 transition-all shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              Try Original
            </button>
          </div>
          {(languages.length > 1 || isAnime) && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Available Languages</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {/* Anime: make the sub entry a first-class pill so users can get
                    back to it after picking a dub. Dubs still come from NetMirror. */}
                {isAnime && !languages.some(l => /^(original|japanese)$/i.test(String(l.language || ''))) && (
                  <button
                    onClick={() => { setTitleMismatch(false); navigate(`/play/${type}/${originalIdRef.current || id}?netmirror=true&expectedTitle=${encodeURIComponent(media.title || media.name || '')}`); }}
                    className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                      isAnimeSubEntry
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : 'bg-white/[0.04] text-zinc-300 border-white/10 hover:bg-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm">🎬</span>
                    <span>Japanese <span className="opacity-60">Sub</span></span>
                  </button>
                )}
                {languages.map((lang) => {
                  const langEmoji = { hindi: '🇮🇳', english: '🇺🇸', spanish: '🇪🇸', french: '🇫🇷', german: '🇩🇪', japanese: '🇯🇵', korean: '🇰🇷', portuguese: '🇧🇷', italian: '🇮🇹', chinese: '🇨🇳', arabic: '🇸🇦', turkish: '🇹🇷', russian: '🇷🇺', thai: '🇹🇭', original: '🎬' };
                  const emoji = langEmoji[lang.language] || '🌍';
                  return (
                    <button
                      key={lang.id}
                      onClick={() => { setTitleMismatch(false); navigate(`/play/${type}/${lang.id}?netmirror=true&expectedTitle=${encodeURIComponent(media.title || media.name || '')}`); }}
                      className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                        String(lang.id) === String(id)
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-white/[0.04] text-zinc-300 border-white/10 hover:bg-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <span className="text-sm">{emoji}</span>
                      <span className="capitalize">{lang.language}</span>
                    </button>
                  );
                })}
              </div>

              {/* hianime source controls — only while hianime is the engine */}
              {activeEngine === 'hianime' && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">HD Source</span>
                  <div className="flex overflow-hidden rounded-lg border border-white/15">
                    {['sub', 'dub'].map(a => (
                      <button
                        key={a}
                        onClick={() => setAnimeAudio(a)}
                        className={`px-3 py-1 text-[11px] font-bold capitalize transition-colors ${
                          animeAudio === a ? 'bg-purple-500 text-white' : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <select
                    value={animeServer}
                    onChange={(e) => setAnimeServer(e.target.value)}
                    className="rounded-lg border border-white/15 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                  >
                    {ANIME_SERVERS.map(s => (
                      <option key={s.key} value={s.key}>{s.label} · {s.host}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-zinc-500">dub = English</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="flex min-h-screen flex-col bg-black selection:bg-purple-500/30">
      <SeoHead
        title={`Watch ${media?.title || media?.name || 'Video'}${isTV && currentEpisode ? ` S${currentSeason}E${currentEpisode}` : ''} Free`}
        description={media?.overview?.substring(0, 160) || `Stream ${media?.title || media?.name} in HD for free`}
        image={media?.poster_path ? `https://image.tmdb.org/t/p/w780${media.poster_path}` : undefined}
        type="video.other"
        structuredData={buildMovieSchema(media, type)}
      />

      {/* ── Cinema Mode backdrop (dims everything outside the player) ── */}
      {cinemaMode && (
        <div
          onClick={() => setCinemaMode(false)}
          className="fixed inset-0 z-40 bg-black/95 backdrop-blur-sm cursor-pointer transition-opacity duration-300 flex items-start justify-center pt-4"
        >
          <div className="bg-purple-600/80 text-white text-[11px] font-bold px-3 py-1 rounded-full backdrop-blur-md shadow-lg pointer-events-none">
            🌙 Cinema Mode Active • Click anywhere outside to exit
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PLAYER AREA — edge to edge, no gaps
          ═══════════════════════════════════════════════════════════════ */}
      <div 
        ref={playerContainerRef} 
        className={`relative w-full h-[56.25vw] max-h-[85dvh] min-h-[220px] sm:min-h-[360px] bg-black shrink-0 group nm-player-safe overflow-hidden transition-all duration-300 select-none ${cinemaMode ? 'z-50 shadow-[0_0_80px_rgba(0,0,0,0.95)] ring-1 ring-purple-500/30' : 'z-10'}`}
      >

        {/* Player top bar - back + title + cinema/episode buttons. Fades with player controls. */}
        <div id="nm-player-top-bar" className="nm-player-top-bar absolute top-0 left-0 right-0 z-30 flex items-center gap-1.5 xs:gap-2 px-2.5 xs:px-3 py-2 bg-gradient-to-b from-black/70 via-black/20 to-transparent pointer-events-none transition-all duration-300">
          {/* Player controls — larger tap targets + stronger contrast so they
              read as real controls, not metadata (min 36px touch height). */}
          <button onClick={() => navigate(-1)} aria-label="Back" className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-md px-3 xs:px-3.5 py-2 text-sm font-bold text-white hover:bg-black/90 transition-all active:scale-95 border border-white/15 shrink-0">
            <ChevronLeft size={18} /> <span className="hidden xs:inline">Back</span>
          </button>
          <span className="pointer-events-none min-w-0 flex-1 truncate text-xs sm:text-sm font-semibold text-white/90 px-1">{media?.title || media?.name}</span>
          
                    {/* Quick Screenshot Button */}
          <button
            onClick={takeScreenshot}
            aria-label="Take screenshot"
            className="pointer-events-auto flex items-center gap-1.5 px-3 xs:px-3.5 py-2 rounded-full text-sm font-bold transition-all active:scale-95 border shrink-0 bg-black/70 backdrop-blur-md text-white hover:bg-black/90 border-white/15"
            title="Take Screenshot"
          >
            <Camera size={16} />
            <span className="hidden sm:inline">Capture</span>
          </button>

          {/* Cinema mode button - hidden in fullscreen */}
          {!isFullscreen && (
            <button
              onClick={() => setCinemaMode(m => !m)}
              aria-label="Cinema mode"
              aria-pressed={cinemaMode}
              className={`pointer-events-auto flex items-center gap-1.5 px-3 xs:px-3.5 py-2 rounded-full text-sm font-bold transition-all active:scale-95 border shrink-0 ${cinemaMode ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.5)]' : 'bg-black/70 backdrop-blur-md text-white hover:bg-black/90 border-white/15'}`}
              title="Cinema Mode"
            >
              <Moon size={16} />
              <span className="hidden sm:inline">{cinemaMode ? 'Exit' : 'Cinema'}</span>
            </button>
          )}



          {/* Direct Next Episode Button */}
          {isTV && currentEpisode < episodes.length && (
            <button
              onClick={nextEpisode}
              className="pointer-events-auto flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-full text-xs font-bold transition-all active:scale-95 border shrink-0 bg-white/10 backdrop-blur-md text-white hover:bg-white/20 border-white/20"
              title="Next Episode"
            >
              <SkipForward size={12} />
              <span className="hidden xs:inline">Next Ep</span>
            </button>
          )}

          {/* Watch Party button */}
          <button
            onClick={() => setShowWatchParty(s => !s)}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-full backdrop-blur-md px-2.5 xs:px-3 py-1 text-xs font-bold transition-all active:scale-95 border shrink-0 ${
              inParty
                ? 'bg-emerald-600 text-white border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
            title="Watch Party"
          >
            <Users size={13} />
            <span>Party</span>
            {inParty && <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />}
          </button>

          {/* Episode drawer button */}
          {(isTV || seasons.length > 0 || episodes.length > 0 || type === 'anime' || Boolean(media?.number_of_seasons)) && (
            <button
              onClick={() => setShowEpDrawer(s => !s)}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-purple-600 text-white hover:bg-purple-500 backdrop-blur-md px-2.5 xs:px-3 py-1 text-xs font-bold transition-all shadow-[0_0_12px_rgba(168,85,247,0.4)] active:scale-95 border border-purple-400/50 shrink-0"
              title="Episodes"
            >
              <Layers size={13} /> <span>Episodes</span>
            </button>
          )}
        </div>

        {/* Server error overlay */}
        {serverError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-zinc-950/98 backdrop-blur-sm">
            <p className="text-lg font-semibold text-white">Stream unavailable</p>
            <p className="text-sm text-zinc-500 max-w-xs text-center">This source returned no playable stream. Try another server.</p>
            <div className="flex gap-3">
              <button onClick={reloadPlayer} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/10 transition-all"><RefreshCw size={14} /> Retry</button>
              <button onClick={tryNextServer} className="flex items-center gap-2 rounded-xl bg-purple-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-600 transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)]"><SkipForward size={14} /> Next Server</button>
            </div>
          </div>
        )}

        {/* Player loading overlay — covers black iframe until ArtPlayer loads */}
        {playerLoading && !serverError && (
          <div className="absolute inset-0 z-[15] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none transition-opacity duration-300">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">Buffering</span>
            </div>
          </div>
        )}

        {/* Native player — works for both NetMirror MP4 and Vega HLS */}
        {/* Anime sub via hianime (AniList) — iframe, so video bytes never touch
            the VPS and there is no CORS problem. Dubs never reach this branch. */}
        {activeEngine === 'hianime' && animeEmbed && (
          <iframe
            key={`anime-${anilistId}-${currentEpisode}-${animeAudio}-${animeServer}`}
            src={animeEmbed}
            className="absolute inset-0 z-10 h-full w-full border-0 bg-black"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; playsinline"
            onLoad={() => { setLoading(false); setServerError(false); setPlayerLoading(false); }}
            onError={() => { setLoading(false); setServerError(true); setActiveEngine('netmirror'); }}
            title="Video Player"
          />
        )}

        {/* External server. HLS streams (miruro) go through OUR ArtPlayer so we
            keep custom controls, volume boost and subtitle rendering — an
            iframe would only ever show the browser's native controls.
            Embeds (vidlink/videasy) stay as iframes — they are whole pages. */}
        {extUrl && isHlsUrl(extUrl) && (
          <div className="absolute inset-0 z-10">
            <NetMirrorPlayer
              sources={[{ url: extUrl, quality: 'HD' }]}
              subtitles={extSubs}
              title={media?.title || media?.name || 'Video'}
              hlsMode
              onToggleFullscreen={toggleFullscreen}
              onError={() => { setExtUrl(null); setExtServer(null); }}
            />
          </div>
        )}

        {extUrl && !isHlsUrl(extUrl) && (
          <iframe
            key={`ext-${extServer}-${currentSeason}-${currentEpisode}`}
            src={extUrl}
            className="absolute inset-0 z-10 h-full w-full border-0 bg-black"
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; playsinline"
            // Free embed providers refuse to load inside a sandboxed iframe
            // ("sandbox not supported / detected"), so playback needs the un-
            // sandboxed frame. Ad popups are the accepted trade-off.
            referrerPolicy="origin"
            onLoad={() => { setLoading(false); setServerError(false); setPlayerLoading(false); }}
            onError={() => { setExtUrl(null); setExtServer(null); }}
            title="Video Player"
          />
        )}

        {(provider?.netmirror || provider?.vega) && netmirrorData && activeEngine !== 'hianime' && !extUrl && (
          <NetMirrorPlayer
            key={`nmplayer-${currentSource}-${id}-${currentSeason}-${currentEpisode}-${iframeKey}`}
            sources={netmirrorData.sources}
            subtitles={netmirrorData.subtitles}
            title={media.title || media.name}
            hlsMode={netmirrorData.isHls || false}
            onToggleFullscreen={toggleFullscreen}
            onTimeUpdate={({ currentTime, playing }) => {
              watchTimeRef.current = currentTime;
              setPartyPlaying(playing);
            }}
            onReady={() => { setLoading(false); setServerError(false); setPlayerLoading(false); }}
            onError={handleNmError}
          />
        )}

        {/* Iframe — for backup providers (Videasy, VidLink, AutoEmbed) */}
        {!provider?.netmirror && (
          <>
            <iframe
              ref={iframeRef}
              key={`player-${currentSource}-${id}-${currentSeason}-${currentEpisode}-${iframeKey}`}
              src={getUrl()}
              className="absolute inset-0 z-10 h-full w-full border-0 bg-black"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; playsinline"
              referrerPolicy="no-referrer"
              onLoad={() => { setLoading(false); setServerError(false); setPlayerLoading(false); }}
              onError={() => { setLoading(false); setServerError(true); }}
              title="Video Player"
            />
            {/* Ad warning banner for backup server — fades out after a few
                seconds instead of hanging around for the whole session. */}
            <div
              className={`absolute top-12 left-3 right-3 z-30 pointer-events-none flex justify-center transition-opacity duration-700 ease-out ${
                noticeVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="bg-zinc-950/90 backdrop-blur-md border border-amber-500/30 rounded-xl px-3 py-1.5 text-[11px] text-amber-300 font-semibold shadow-xl flex items-center gap-2">
                <span>⚠️ <strong>Backup Server Notice:</strong> This external stream may contain ads. For ad-free streaming & subtitles, use <strong>Server 1</strong>.</span>
              </div>
            </div>
          </>
        )}

        {/* Info Overlay */}
        {showInfo && (
          <div className="absolute inset-0 z-[25] bg-gradient-to-t from-black via-black/70 to-black/30 flex flex-col justify-end p-8 md:p-12 animate-[fadeIn_0.3s_ease]">
            <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white transition-all"><X size={18} /></button>
            {backdropUrl && <div className="absolute inset-0 opacity-20 blur-sm" style={{ background: `url(${backdropUrl}) center/cover no-repeat` }} />}
            <div className="relative max-w-3xl">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">{media.title || media.name}</h2>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {releaseYear && <span className="flex items-center gap-1 text-sm text-zinc-400"><Calendar size={13} /> {releaseYear}</span>}
                {rating > 0 && <span className="flex items-center gap-1 text-sm text-amber-400"><Star size={13} /> {rating}</span>}
                {runtime && <span className="flex items-center gap-1 text-sm text-zinc-400"><Clock size={13} /> {runtime}</span>}
              </div>
              {media.overview && <p className="text-sm text-zinc-300 leading-relaxed line-clamp-4 mb-4">{media.overview}</p>}
              {media.genres?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {media.genres.map((g, i) => <span key={g.id || g.name || i} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs text-white/80 backdrop-blur-sm">{g.name}</span>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom gradient bar — hidden on mobile (no overlay clutter) */}
        <div className="absolute bottom-0 left-0 right-0 z-20 h-20 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none opacity-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />

        {/* ── Next Episode countdown popup ── */}
        {nextEpCountdown !== null && isTV && (
          <div className="absolute bottom-16 right-4 z-30 flex flex-col gap-2 p-4 rounded-2xl border border-white/10 shadow-2xl"
            style={{ background: 'rgba(13,15,26,0.97)', backdropFilter: 'blur(20px)', animation: 'slideIn .3s ease', minWidth: 220 }}>
            <p className="text-[11px] font-black uppercase tracking-widest text-purple-400">Up Next</p>
            <p className="text-sm font-bold text-white">
              {episodes[currentEpisode]?.name || `Episode ${currentEpisode + 1}`}
            </p>
            <p className="text-xs text-zinc-400">Playing in <span className="text-white font-bold">{nextEpCountdown}s</span></p>
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setNextEpCountdown(null); clearInterval(nextEpTimerRef.current); nextEpisode(); }}
                className="flex-1 py-2 rounded-xl bg-purple-600 text-white text-xs font-black hover:bg-purple-500 transition-all">
                Play Now
              </button>
              <button onClick={() => { setNextEpCountdown(null); clearInterval(nextEpTimerRef.current); }}
                className="px-3 py-2 rounded-xl bg-white/10 text-zinc-300 text-xs font-bold hover:bg-white/20 transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* ── Minimal Episode Side Bar (Inside player — works in fullscreen & normal mode!) ── */}
        {showEpDrawer && isTV && (
          <div className="absolute inset-0 z-40 flex justify-end pointer-events-none" style={{ animation: 'fadeIn .18s ease' }}>
            {/* Click-to-close transparent scrim */}
            <div 
              className="absolute inset-0 bg-black/40 pointer-events-auto cursor-pointer"
              onClick={() => setShowEpDrawer(false)}
            />
            {/* Minimal slide-over sidebar panel */}
            <aside 
              className="relative pointer-events-auto w-[280px] xs:w-[320px] sm:w-[360px] max-w-[85%] h-full bg-zinc-950/95 border-l border-white/10 shadow-2xl flex flex-col backdrop-blur-md z-10"
              style={{ animation: 'slideInRight .22s cubic-bezier(.22,1,.36,1)' }}
            >
              {/* Header shows drawerSeason (the season being previewed) */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.08] bg-zinc-900/90 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 shrink-0">
                    <Layers size={14} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-white truncate">Season {drawerSeason}</h3>
                    <p className="text-[10px] text-zinc-400">{drawerEpisodes.length} episodes</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowEpDrawer(false)} 
                  className="p-1.5 rounded-lg bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
                  title="Close (Esc)"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Season Selector Tabs (Browsing season does NOT change video stream) */}
              {seasons.length > 1 && (
                <div className="flex gap-1.5 px-2.5 py-2 overflow-x-auto hide-scrollbar border-b border-white/[0.06] bg-zinc-950/60 shrink-0">
                  {seasons.filter(s => s.season_number > 0).map(s => (
                    <button 
                      key={s.season_number} 
                      onClick={() => browseDrawerSeason(s.season_number)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                        drawerSeason === s.season_number
                          ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                          : 'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      S{s.season_number}
                    </button>
                  ))}
                </div>
              )}

              {/* Episode list */}
              <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
                {drawerLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400 text-xs font-bold">
                    <Loader2 size={18} className="animate-spin text-purple-500" />
                    <span>Loading Season {drawerSeason}...</span>
                  </div>
                ) : drawerEpisodes.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500 text-xs">No episodes found.</div>
                ) : (
                  drawerEpisodes.map(ep => {
                    const isCur = currentSeason === drawerSeason && currentEpisode === ep.episode_number;
                    const stillUrl = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : (backdropUrl || null);
                    return (
                      <button 
                        key={ep.episode_number} 
                        onClick={() => selectDrawerEpisode(drawerSeason, ep.episode_number)}
                        className={`w-full group flex items-center gap-2.5 p-2 rounded-xl text-left transition-all border ${
                          isCur 
                            ? 'bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/50 shadow-md' 
                            : 'border-transparent hover:border-white/10 hover:bg-white/[0.04] bg-transparent'
                        }`}
                      >
                        <div className="aspect-video w-16 sm:w-20 rounded-lg bg-zinc-900 relative overflow-hidden shrink-0 border border-white/5">
                          {stillUrl ? (
                            <img src={stillUrl} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-zinc-600 text-[10px] font-bold">EP {ep.episode_number}</div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          <div className="absolute bottom-0.5 left-1 text-[8px] font-black text-white">
                            EP {ep.episode_number}
                          </div>
                          {isCur && (
                            <div className="absolute inset-0 flex items-center justify-center bg-purple-950/50">
                              <Play size={9} fill="white" className="text-white ml-0.5 animate-pulse" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[11px] font-bold truncate ${isCur ? 'text-purple-300' : 'text-zinc-200 group-hover:text-white'}`}>
                              {ep.name || `Episode ${ep.episode_number}`}
                            </span>
                            {isCur && (
                              <span className="shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border border-purple-500/40">
                                Playing
                              </span>
                            )}
                          </div>
                          {ep.overview && (
                            <p className="text-[10px] text-zinc-500 line-clamp-1 leading-snug">
                              {ep.overview}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        )}

        {/* ── Watch Party Slide-Over Panel ── */}
        <WatchPartyPanel
          isOpen={showWatchParty}
          onClose={() => setShowWatchParty(false)}
          onOpen={() => setShowWatchParty(true)}
          currentTime={watchTimeRef.current}
          isPlaying={partyPlaying}
          mediaTitle={media?.title || media?.name || 'Video'}
          mediaId={id}
          mediaType={type}
          season={currentSeason}
          episode={currentEpisode}
          partyCodeFromUrl={partyCodeFromUrl}
          onRemoteSync={(data) => {
            // Guard: host and guest on different ids/dubs must converge ONCE.
            // Without the navigating flag, every host sync re-triggers
            // navigate → remount → resubscribe → another navigate, which is
            // the "pasted party link breaks the whole player" loop.
            if (data.mediaInfo && data.mediaInfo.mediaId && (data.mediaInfo.mediaId !== id || data.mediaInfo.season !== currentSeason || data.mediaInfo.episode !== currentEpisode)) {
              if (partyNavRef.current) return;
              partyNavRef.current = true;
              navigate(`/play/${data.mediaInfo.mediaType || type}/${data.mediaInfo.mediaId}?netmirror=${isNetMirrorId}&party=${watchParty.roomId || partyCodeFromUrl}`);
              setTimeout(() => { partyNavRef.current = false; }, 3000);
              return;
            }
            const video = playerContainerRef.current?.querySelector('video');
            if (video) {
              // Compensate for network latency: if the host is playing, its
              // position has advanced by the time this message arrives. Add the
              // one-way-ish delay so guests land where the host actually is.
              let target = data.currentTime;
              if (typeof target === 'number') {
                if (data.state === 'playing' && data.sentAt) {
                  target += Math.max(0, (Date.now() - data.sentAt) / 1000);
                }
                // Only hard-seek on real drift (>1.5s) so we don't stutter every heartbeat.
                if (Math.abs(video.currentTime - target) > 1.5) video.currentTime = target;
              }
              if (data.state === 'playing' && video.paused) video.play().catch(() => {});
              if (data.state === 'paused' && !video.paused) video.pause();
            }
          }}
          onRemoteSeek={(data) => {
            const video = playerContainerRef.current?.querySelector('video');
            if (video && typeof data.currentTime === 'number') video.currentTime = data.currentTime;
          }}
          onRemoteMediaChange={(data) => {
            if (data.mediaId && data.mediaId !== id) {
              if (partyNavRef.current) return;
              partyNavRef.current = true;
              navigate(`/play/${data.mediaType || type}/${data.mediaId}?netmirror=${isNetMirrorId}&party=${watchParty.roomId || partyCodeFromUrl}`);
              setTimeout(() => { partyNavRef.current = false; }, 3000);
            }
          }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          BELOW PLAYER — Clean Responsive Content Bar
          ═══════════════════════════════════════════════════════════════ */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 pb-8 lg:pb-6 space-y-3 max-w-[1400px] mx-auto w-full">

        {/* ── Title row + quick actions ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-white/[0.06]">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white leading-tight tracking-tight">{media.title || media.name}</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-zinc-400 font-semibold">
              {releaseYear && <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">{releaseYear}</span>}
              {rating > 0 && (
                <span className="flex items-center gap-1 text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20 font-bold">
                  <Star size={11} fill="currentColor" /> {rating}
                </span>
              )}
              {runtime && <span className="flex items-center gap-1"><Clock size={11} className="text-zinc-500" /> {runtime}</span>}
              {isTV && seasons.length > 0 && <span className="text-zinc-500">{seasons.length} Season{seasons.length > 1 ? 's' : ''}</span>}
              {isTV && (
                <span className="text-purple-300 font-bold bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-md">
                  S{currentSeason} : E{currentEpisode}
                </span>
              )}
            </div>
          </div>

          {/* Quick Action Buttons (Episodes lives in the top bar — no dupe) */}
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <button onClick={handleShare} className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/[0.06] transition-all active:scale-95" title="Share Link">
              <Share2 size={16} />
            </button>
            <button onClick={toggleLike} className={`p-2.5 rounded-xl transition-all border active:scale-95 ${isLiked ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06]'}`} title="Like">
              <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
            <button onClick={toggleBookmark} className={`p-2.5 rounded-xl transition-all border active:scale-95 ${isBookmarked ? 'text-purple-300 bg-purple-500/20 border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.3)]' : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06]'}`} title="Bookmark">
              {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
            <button onClick={toggleFullscreen} className="p-2.5 rounded-xl text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all active:scale-95" title="Fullscreen (F)">
              <Maximize size={16} />
            </button>
          </div>
        </div>

        {/* ── Overview & Genres (clamped + mobile-collapsed) ── */}
        <div className="space-y-2">
          {media.overview && (
            <>
              <p className={`text-xs sm:text-sm text-zinc-300/90 leading-relaxed max-w-4xl ${showFullOverview ? '' : 'line-clamp-2'}`}>{media.overview}</p>
              <button onClick={() => setShowFullOverview(v => !v)} className="text-[11px] font-bold text-purple-400 hover:text-purple-300 transition-colors">
                {showFullOverview ? 'Show less' : 'More'}
              </button>
            </>
          )}
          {media.genres?.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 pt-1">
              {media.genres.map((g, i) => (
                <span key={g.id || g.name || i} className="text-[11px] font-semibold text-zinc-400 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.06]">{g.name}</span>
              ))}
            </div>
          )}
        </div>

        {/* ── Server Selection & Dub Languages ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* Servers card */}
          <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-500">
              <span className="flex items-center gap-1.5"><Zap size={12} className="text-purple-400" /> Video Servers</span>
              <button onClick={tryNextServer} className="text-purple-400 hover:text-purple-300 font-bold transition-colors">
                <SkipForward size={11} className="inline mr-0.5" /> Next Server
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PROVIDERS.map(item => (
                <button
                  key={item.key}
                  onClick={() => switchSource(item.key)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all border active:scale-95 ${
                    currentSource === item.key
                      ? 'bg-purple-600 text-white border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                      : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
                  }`}
                >
                  {item.label}
                  {item.netmirror && (
                    <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-500/30">
                      Ad-Free
                    </span>
                  )}
                  {item.isBackup && (
                    <span className="text-[8px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded-md border border-amber-500/25">
                      Ads
                    </span>
                  )}
                  {currentSource === item.key && !playerLoading && !serverError && item.netmirror && (
                    <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider bg-purple-500/30 text-purple-200 px-1.5 py-0.5 rounded-md">
                      <Wifi size={8} /> Active
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Dub Languages card */}
          {languages.length > 0 && (
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-500">
                <span className="flex items-center gap-1.5"><Globe size={12} className="text-sky-400" /> Audio &amp; Dubs</span>
                <span className="text-[10px] text-zinc-600">{languages.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 overflow-x-auto hide-scrollbar max-w-full">
                {/* Anime: first-class "back to sub" pill. Dubs still come from
                    NetMirror — hianime is only ever the engine behind this one. */}
                {isAnime && !languages.some(l => /^(original|japanese)$/i.test(String(l.language || ''))) && (
                  <button
                    onClick={() => navigate(`/play/${type}/${originalIdRef.current || id}?netmirror=true&expectedTitle=${encodeURIComponent(media.title || media.name || '')}`)}
                    className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all border active:scale-95 shrink-0 ${
                      isAnimeSubEntry
                        ? 'bg-sky-500/20 text-sky-200 border-sky-500/40 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                        : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
                    }`}
                  >
                    <span>🎬</span>
                    <span>Japanese <span className="opacity-60">Sub</span></span>
                  </button>
                )}
                {languages.map(lang => {
                  const langEmoji = { hindi: '🇮🇳', english: '🇺🇸', spanish: '🇪🇸', french: '🇫🇷', german: '🇩🇪', japanese: '🇯🇵', korean: '🇰🇷', portuguese: '🇧🇷', italian: '🇮🇹', chinese: '🇨🇳', arabic: '🇸🇦', turkish: '🇹🇷', russian: '🇷🇺', thai: '🇹🇭', original: '🎬' };
                  const isCurLang = String(lang.id) === String(id);
                  return (
                    <button
                      key={lang.id}
                      onClick={() => navigate(`/play/${type}/${lang.id}?netmirror=true&expectedTitle=${encodeURIComponent(media.title || media.name || '')}`)}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-all border active:scale-95 shrink-0 ${
                        isCurLang
                          ? 'bg-sky-500/20 text-sky-200 border-sky-500/40 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                          : 'bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] border-white/[0.06]'
                      }`}
                    >
                      <span>{langEmoji[lang.language] || '🌍'}</span>
                      <span className="capitalize">{lang.language}</span>
                    </button>
                  );
                })}
              </div>

              {/* hianime source controls — only while hianime is the engine */}
              {activeEngine === 'hianime' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">HD Source</span>
                  <div className="flex overflow-hidden rounded-lg border border-white/10">
                    {['sub', 'dub'].map(a => (
                      <button
                        key={a}
                        onClick={() => setAnimeAudio(a)}
                        className={`px-2.5 py-1 text-[11px] font-bold capitalize transition-colors ${
                          animeAudio === a ? 'bg-purple-500 text-white' : 'bg-white/[0.04] text-zinc-400 hover:text-white'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <select
                    value={animeServer}
                    onChange={e => setAnimeServer(e.target.value)}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
                  >
                    {ANIME_SERVERS.map(s => (
                      <option key={s.key} value={s.key}>{s.label} · {s.host}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-zinc-600">dub = English</span>
                </div>
              )}

              {/* External servers (hianime / miruro / videasy) — registry driven */}
              {serverList.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Servers</span>
                  {serverList.map(srv => (
                    <button
                      key={srv.key}
                      onClick={() => playExternal(srv)}
                      title={srv.kind === 'embed' ? 'Embedded player' : undefined}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all active:scale-95 ${
                        extServer === srv.key
                          ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                          : 'bg-white/[0.04] text-zinc-400 border-white/[0.08] hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      {srv.label}
                      <span className="rounded bg-black/30 px-1 text-[9px] font-black tracking-wide opacity-70">{srv.badge}</span>
                    </button>
                  ))}
                  {extLoading && <span className="text-[10px] text-zinc-500">resolving…</span>}
                  {extServer && (
                    <button
                      onClick={() => { setExtServer(null); setExtUrl(null); }}
                      className="text-[10px] text-zinc-500 hover:text-white underline"
                    >
                      back to default
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Season + Episode Section (TV only) ── */}
        {isTV && seasons.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={currentSeason}
                  onChange={(e) => loadEpisodesFor(Number(e.target.value))}
                  className="appearance-none bg-zinc-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3.5 py-2 pr-8 cursor-pointer hover:bg-zinc-800 transition-colors focus:outline-none focus:border-purple-500"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a855f7' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                >
                  {seasons.filter(s => s.season_number > 0).map(s => (
                    <option key={s.season_number} value={s.season_number} className="bg-zinc-950 text-white">
                      Season {s.season_number}{s.episode_count ? ` (${s.episode_count} eps)` : ''}
                    </option>
                  ))}
                </select>

                {episodes.length > 0 && (
                  <select
                    value={currentEpisode}
                    onChange={(e) => changeEpisode(Number(e.target.value))}
                    className="appearance-none bg-zinc-900 border border-white/10 text-white text-xs font-bold rounded-xl px-3.5 py-2 pr-8 cursor-pointer hover:bg-zinc-800 transition-colors focus:outline-none focus:border-purple-500 max-w-[200px] sm:max-w-xs"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a855f7' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                  >
                    {episodes.map(ep => (
                      <option key={ep.episode_number} value={ep.episode_number} className="bg-zinc-950 text-white">
                        Ep {ep.episode_number}{ep.name ? ` — ${ep.name}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Matches the season/episode <select> treatment (outlined zinc)
                  so the whole row shares one visual language. */}
              <button
                onClick={() => setShowEpDrawer(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 border border-white/10 hover:border-purple-500/40 text-xs font-bold transition-all active:scale-95"
              >
                <Layers size={13} className="text-purple-400" /> View All in Side Bar
              </button>
            </div>

            {/* Episode cards carousel */}
            {episodes.length <= 30 ? (
              <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 hide-scrollbar snap-x snap-mandatory">
                {episodes.map(ep => {
                  const isCur = currentEpisode === ep.episode_number;
                  const stillUrl = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : (backdropUrl || null);
                  return (
                    <EpisodeCard key={ep.episode_number} ep={ep} isCurrent={isCur} stillUrl={stillUrl} unavailable={isEpNa(ep.episode_number)} onClick={() => changeEpisode(ep.episode_number)} />
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                {episodes.map(ep => {
                  const na = isEpNa(ep.episode_number);
                  return (
                    <button key={ep.episode_number} onClick={() => !na && changeEpisode(ep.episode_number)}
                      title={na ? 'No stream available for this episode' : undefined}
                      className={`relative text-xs font-bold py-2 rounded-lg transition-all border active:scale-95 ${
                        na
                          ? 'bg-white/[0.02] text-zinc-600 border-white/[0.04] cursor-not-allowed'
                          : currentEpisode === ep.episode_number
                            ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                            : 'bg-white/[0.04] text-zinc-400 border-white/[0.06] hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {ep.episode_number}
                      {na && <span className="absolute -top-1.5 -right-1 text-[7px] font-black text-red-400">N/A</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          RECOMMENDATIONS
          ═══════════════════════════════════════════════════════════════ */}
      {recs.length > 0 && (
        <div className="border-t border-white/[0.06] px-3 sm:px-6 py-5 max-w-[1400px] mx-auto w-full">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">More Like This</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {recs.map(item => (
              <div key={item.id} className="w-[120px] shrink-0 sm:w-[150px]">
                <MediaCard item={item} type={isTV ? 'tv' : 'movie'} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share toast */}
      {shareToast && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-[fadeIn_0.2s_ease]">
          Link copied!
        </div>
      )}

      {/* Global animation keyframes */}
      <style>{`
        @keyframes slideDown { from { opacity:0; transform: translate(-50%, -12px); } to { opacity:1; transform: translate(-50%, 0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideIn { from { opacity:0; transform: translateX(12px); } to { opacity:1; transform: translateX(0); } }
        @keyframes slideUp { from { opacity:0; transform: translateY(100%); } to { opacity:1; transform: translateY(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        /* Clear the mobile browser/status/address bars so the back button and
           control bar are never cut off by device UI. */
        .nm-player-safe {
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .nm-player-safe:fullscreen,
        .nm-player-safe:-webkit-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          max-height: 100vh !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #000 !important;
        }
        .nm-player-safe:fullscreen .art-video-player,
        .nm-player-safe:-webkit-full-screen .art-video-player {
          width: 100% !important;
          height: 100% !important;
        }
      
        /* ── Player top bar fades with ArtPlayer controls ── */
        /* Default: top bar is visible (controls shown on load) */
        .nm-player-top-bar {
          opacity: 1;
          transition: opacity 0.3s ease, pointer-events 0s;
        }
        /* When art-hover is removed (controls hidden), hide top bar too */
        .nm-player-safe:not(.nm-controls-visible) .nm-player-top-bar {
          opacity: 0;
          pointer-events: none !important;
        }
        .nm-player-safe:not(.nm-controls-visible) .nm-player-top-bar * {
          pointer-events: none !important;
        }
        /* Always show top bar on hover over player area */
        .nm-player-safe:hover .nm-player-top-bar {
          opacity: 1;
        }
        .nm-player-safe:hover .nm-player-top-bar button {
          pointer-events: auto !important;
        }`}</style>
    </div>
  );
}
