import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent, useEventListener } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, prefetchSources, pickTmdbMatch, getApiBase, getCdnCfg, loadCdnCfg } from '../../../api';
import { usePrefs } from '../../../prefs';
import { saveRecent } from '../../../recent';
import { PosterCard } from '../../../components/PosterCard';
import { WatchPartySheet } from '../../../components/WatchPartySheet';
import { party } from '../../../party/party';
import { cueTextAt, parseVtt, SUB_COLORS, SUB_RANGES, SUB_STYLE_DEFAULT, type Cue, type SubStyle } from '../../../subtitles';

type ExtServer = { key: string; label: string; url: string };

// Deep links / shared party links open with no history — fall back to home
// instead of expo-router's "GO_BACK was not handled" warning.
function backOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/' as any);
}

function tmdbEmbeds(tmdbId: string, isTV: boolean, s: number, e: number): ExtServer[] {
  if (!tmdbId || tmdbId.includes('_') === false && isNaN(Number(tmdbId))) return [];
  const slash = isTV ? `/tv/${tmdbId}/${s}/${e}` : `/movie/${tmdbId}`;
  return [
    { key: 'server1', label: 'Server 1', url: `https://bingr.one/embed${slash}?color=a855f7` },
    { key: 'server2', label: 'Server 2', url: `https://vidsync.pro/embed${slash}` },
    { key: 'vidnest', label: 'Vidnest', url: `https://vidnest.fun${slash}` },
    { key: 'vidlink', label: 'VidLink', url: `https://vidlink.pro${slash}` },
  ];
}

export default function PlayScreen() {
  const { t } = usePrefs();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const pick = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;
  const type = pick(params.type) || 'movie';
  const id = pick(params.id);
  const isTV = type === 'tv';
  const expectedTitle = pick(params.expectedTitle) || '';
  const netmirror = pick(params.netmirror);
  const isNetMirrorId = netmirror === 'true';
  const partyCodeParam = (pick(params.party) || '').trim().toUpperCase();
  const season = Number(pick(params.season)) || 1;
  const episode = Number(pick(params.episode)) || 1;
  const [data, setData] = useState<any>(null);
  const [dataFor, setDataFor] = useState('');
  const [active, setActive] = useState(0);
  const [ext, setExt] = useState<ExtServer | null>(null);
  const [extFor, setExtFor] = useState('');
  const [error, setError] = useState('');
  const [errorFor, setErrorFor] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [recs, setRecs] = useState<any[]>([]);
  const [dubs, setDubs] = useState<any[]>([]);
  // TV episode picker: TMDB id resolved for NetMirror items, then seasons and
  // the episode list for the season being browsed.
  const [tmdbId, setTmdbId] = useState(!isNetMirrorId ? id : '');
  const [tvSeasons, setTvSeasons] = useState<any[]>([]);
  const [tvEps, setTvEps] = useState<any[]>([]);
  const [pickSeason, setPickSeason] = useState(season);
  const [showEpsList, setShowEpsList] = useState(false);
  const [epsOpen, setEpsOpen] = useState(true);
  const [epsFor, setEpsFor] = useState('');
  const [epsShown, setEpsShown] = useState<{ key: string; n: number }>({ key: '', n: 20 });
const [failNote, setFailNote] = useState('');
const [showParty, setShowParty] = useState(!!partyCodeParam);
const [fsFull, setFsFull] = useState(false);
  const [inParty, setInParty] = useState(!!party.roomId);
  const [isPartyHost, setIsPartyHost] = useState(party.isHost);
  const [reaction, setReaction] = useState<{ emoji: string; sender: string } | null>(null);
  const playerRef = useRef<PlayerHandle>(null);
  const partyNavRef = useRef(false);
  const autoJoinTried = useRef(false);
  // Latest season/episode for TMDB matching without re-triggering the
  // recs/picker effects on every episode hop. Runs before those effects.
  const epCtxRef = useRef({ season, episode });
  useEffect(() => { epCtxRef.current = { season, episode }; });
  const reqKey = `${type}|${id}|${season}|${episode}|${expectedTitle}|${pick(params.language) || ''}|${netmirror}|${attempt}`;

  const language = pick(params.language) || '';

  useEffect(() => {
    if (!id) return;
    let alive = true;
    prefetchSources({ id, type, season, episode, title: expectedTitle, language, isNetMirror: isNetMirrorId, fresh: attempt > 0 })
      .then((r) => {
        if (!alive) return;
        const sources = Array.isArray(r?.sources) ? r.sources.filter((s: any) => s && typeof s.url === 'string' && s.url) : [];
        const embeds = Array.isArray(r?.embeds) ? r.embeds.filter((e: any) => e && e.url) : [];
        if (r?.success && sources.length) {
          setData({ ...r, sources, embeds });
          setDataFor(reqKey);
          setExt(null);
          setExtFor(reqKey);
          setActive(0);
          const title = r.title || expectedTitle || 'Video';
          const entry: any = { id, title, language: r.language || language || '', isTV, type, isNetMirror: isNetMirrorId, expectedTitle: expectedTitle || title, timestamp: Date.now() };
          saveRecent(entry);
          // Subtitle parity with web/desktop: when the stream ships no subs,
          // ask the backend finder (OpenSubtitles) once per title/episode.
          if (!(Array.isArray(r.subtitles) && r.subtitles.length)) {
            const cleanTitle = String(title).replace(/\s*\[.*?\]/g, '').replace(/\s*S\d+.*$/i, '').trim();
            if (cleanTitle) {
              const p = new URLSearchParams({ title: cleanTitle, type, langs: 'en,hi,es,ar,pt,fr,id' });
              if (isTV) { p.set('season', String(season)); p.set('episode', String(episode)); }
              api.subsFind(p.toString())
                .then((subs) => {
                  if (alive && Array.isArray(subs) && subs.length) {
                    setData((prev: any) => (prev && !(Array.isArray(prev.subtitles) && prev.subtitles.length) ? { ...prev, subtitles: subs } : prev));
                  }
                })
                .catch(() => {});
            }
          }
          if (!isNetMirrorId) {
            api.details(type, id).then((d: any) => {
              if (d?.poster_path || d?.backdrop_path) saveRecent({ ...entry, poster_path: d.poster_path || null, backdrop_path: d.backdrop_path || null });
            }).catch(() => {});
          }
        } else if (r?.success && (r?.isEmbedOnly || embeds.length)) {
          setData({ ...r, sources: [], embeds });
          setDataFor(reqKey);
        } else {
          setError(r?.code && r.code !== r?.error ? `${r.error} (${r.code})` : (r?.error || 'no_sources'));
          setErrorFor(reqKey);
        }
      })
      .catch(() => { if (alive) { setError('fetch_failed'); setErrorFor(reqKey); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  // More Like This: TMDB recommendations. NetMirror ids are not TMDB ids, so
  // map to the closest TMDB match by title first (same as web/desktop).
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        if (!isNetMirrorId) {
          const r = await api.recs(type, id);
          if (alive) setRecs((r || []).filter((x: any) => x && x.id && (x.poster_path || x.backdrop_path)).slice(0, 18));
          return;
        }
        const q = expectedTitle || data?.title || '';
        if (!q) return;
        const results = await api.search(q);
        const match = await pickTmdbMatch(results, type, q, epCtxRef.current.season, epCtxRef.current.episode);
        if (!match) return;
        const r = await api.recs(match.media_type || type, match.id);
        if (alive) setRecs((r || []).filter((x: any) => x && x.id && (x.poster_path || x.backdrop_path)).slice(0, 18));
      } catch { if (alive) setRecs([]); }
    })();
    return () => { alive = false; };
  }, [id, type, isNetMirrorId, expectedTitle, data?.title]);

  // Dub/language alternatives for this exact work (NetMirror catalog variants).
  // Try the stream's resolved title first, then the title we navigated with —
  // either can match a different set of catalog variants.
  useEffect(() => {
    const q = data?.title || expectedTitle;
    if (!q) return;
    let alive = true;
    (async () => {
      let l = await api.languages(q).catch(() => []);
      if (alive && (!Array.isArray(l) || !l.length) && expectedTitle && expectedTitle !== q) {
        l = await api.languages(expectedTitle).catch(() => []);
      }
      if (alive) setDubs(Array.isArray(l) ? l : []);
    })();
    return () => { alive = false; };
  }, [data?.title, expectedTitle]);

  // Episode picker data: NetMirror ids are not TMDB ids, so map to the closest
  // TMDB match by title first (same pattern as More Like This).
  useEffect(() => {
    if (!isTV || !isNetMirrorId || tmdbId) return;
    const q = expectedTitle || data?.title || '';
    if (!q) return;
    let alive = true;
    (async () => {
      try {
        const results = await api.search(q);
        const match = await pickTmdbMatch(results, 'tv', q, epCtxRef.current.season, epCtxRef.current.episode);
        if (alive && match?.id) setTmdbId(String(match.id));
      } catch { /* picker falls back to Prev/Next only */ }
    })();
    return () => { alive = false; };
  }, [isTV, isNetMirrorId, tmdbId, expectedTitle, data?.title]);

  useEffect(() => {
    if (!isTV || !tmdbId) return;
    let alive = true;
    api.seasons(String(tmdbId))
      .then((s) => { if (alive) setTvSeasons((Array.isArray(s) ? s : []).filter((x: any) => x && x.season_number > 0)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isTV, tmdbId]);

  useEffect(() => {
    if (!isTV || !tmdbId) return;
    let alive = true;
    const key = `${tmdbId}|${pickSeason}`;
    api.episodes(String(tmdbId), pickSeason)
      .then((e) => { if (alive) { setTvEps(Array.isArray(e) ? e : []); setEpsFor(key); } })
      .catch(() => { if (alive) { setTvEps([]); setEpsFor(key); } });
    return () => { alive = false; };
  }, [isTV, tmdbId, pickSeason]);

  // Live CDN config (allowlisted Referer) — refreshed server-side by the
  // in-process monitor; fetched here so a NetMirror rotation needs no app update.
  useEffect(() => { loadCdnCfg().catch(() => {}); }, []);

  // Auto-reconnect status note fades on its own.
  useEffect(() => {
    if (!failNote) return;
    const timer = setTimeout(() => setFailNote(''), 5000);
    return () => clearTimeout(timer);
  }, [failNote]);

  // ── Watch party: cross-device rooms shared with the web/desktop apps ────
  useEffect(() => {
    const unsub = party.on('status', ({ connected, isHost }) => {
      setInParty(connected);
      setIsPartyHost(!!isHost);
    });
    const unsubReaction = party.on('reaction', ({ emoji, sender }) => {
      setReaction({ emoji, sender });
    });
    return () => { unsub(); unsubReaction(); };
  }, []);

  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), 2500);
    return () => clearTimeout(timer);
  }, [reaction]);

  // Deep link / shared invite: ?party=CODE auto-joins (never re-joins when we
  // navigate inside the app, the service keeps the live room).
  useEffect(() => {
    if (!partyCodeParam || party.roomId || autoJoinTried.current) return;
    autoJoinTried.current = true;
    AsyncStorage.getItem('kyzen_wp_user').then((u) => {
      party.joinRoom(partyCodeParam, u || 'Guest').catch(() => {});
    }).catch(() => party.joinRoom(partyCodeParam, 'Guest').catch(() => {}));
  }, [partyCodeParam]);

  const mediaInfo = useCallback(() => ({
    mediaId: id,
    mediaType: type,
    season,
    episode,
    mediaTitle: data?.title || expectedTitle || 'Video',
  }), [id, type, season, episode, data?.title, expectedTitle]);

  // Host heartbeat — same cadence as the web player (3s), always reading the
  // live position from the player handle.
  useEffect(() => {
    if (!inParty || !isPartyHost) return;
    const heartbeat = setInterval(() => {
      const h = playerRef.current;
      // Embed server active — the Player is unmounted, so don't broadcast a
      // fake pause/0:00 and yank every guest to the start.
      if (!h) return;
      party.sendSync(h.isPlaying() ? 'playing' : 'paused', h.getTime(), mediaInfo());
    }, 3000);
    return () => clearInterval(heartbeat);
  }, [inParty, isPartyHost, mediaInfo]);

  // Play/pause edges are pushed immediately (heartbeat covers drift).
  const onPlayPauseEvent = useCallback((playing: boolean) => {
    if (!party.isHost) return;
    const h = playerRef.current;
    party.sendSync(playing ? 'playing' : 'paused', h?.getTime() ?? 0, mediaInfo());
  }, [mediaInfo]);

  const onSeekEvent = useCallback((time: number) => {
    if (!party.isHost) return;
    party.sendSeek(time);
  }, []);

  // Vertical season/episode switch keeps the party room attached.
  const partySuffix = party.roomId || partyCodeParam ? `&party=${party.roomId || partyCodeParam}` : '';

  const goEp = (s: number, e: number) => {
    router.replace(`/play/${type}/${id}?expectedTitle=${encodeURIComponent(expectedTitle)}${language ? `&language=${encodeURIComponent(language)}` : ''}${isNetMirrorId ? '&netmirror=true' : ''}&season=${s}&episode=${e}${partySuffix}` as any);
  };

  const goLang = (lang: string) => {
    router.replace(`/play/${type}/${id}?expectedTitle=${encodeURIComponent(expectedTitle)}&language=${encodeURIComponent(lang)}${isNetMirrorId ? '&netmirror=true' : ''}&season=${season}&episode=${episode}${partySuffix}` as any);
  };

  const onRemoteSync = (d: any) => {
    const info = d?.mediaInfo || {};
    if (info.mediaId && (info.mediaId !== id || (info.season || 1) !== season || (info.episode || 1) !== episode)) {
      if (partyNavRef.current) return;
      partyNavRef.current = true;
      const nm = isNetMirrorId ? '&netmirror=true' : '';
      const title = info.mediaTitle ? `&expectedTitle=${encodeURIComponent(info.mediaTitle)}` : '';
      const code = party.roomId || partyCodeParam;
      router.replace(`/play/${info.mediaType || type}/${info.mediaId}?season=${info.season || 1}&episode=${info.episode || 1}${nm}${title}&party=${code}` as any);
      setTimeout(() => { partyNavRef.current = false; }, 3000);
      return;
    }
    const h = playerRef.current;
    if (!h) return;
    if (typeof d?.currentTime === 'number') {
      let target = d.currentTime;
      if (d.state === 'playing' && d.sentAt) target += Math.max(0, (Date.now() - d.sentAt) / 1000);
      if (Math.abs(h.getTime() - target) > 1.5) h.seek(target);
    }
    if (d?.state === 'playing') h.play();
    if (d?.state === 'paused') h.pause();
  };

  const onRemoteSeek = (d: any) => {
    if (typeof d?.currentTime === 'number') playerRef.current?.seek(d.currentTime);
  };

  const onRemoteMediaChange = (d: any) => {
    if (d?.mediaId && d.mediaId !== id) {
      if (partyNavRef.current) return;
      partyNavRef.current = true;
      const nm = isNetMirrorId ? '&netmirror=true' : '';
      const code = party.roomId || partyCodeParam;
      router.replace(`/play/${d.mediaType || type}/${d.mediaId}?season=${d.season || 1}&episode=${d.episode || 1}${nm}&party=${code}` as any);
      setTimeout(() => { partyNavRef.current = false; }, 3000);
    }
  };

  if (!id) return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={[styles.error, { color: t.danger }]}>Missing title id</Text></View>;
  if (error && errorFor === reqKey) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Pressable onPress={backOrHome} hitSlop={12} style={[styles.floatBack, { top: insets.top + 8 }]}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <Text style={[styles.errTitle, { color: t.text }]}>Stream unavailable</Text>
        <Text style={[styles.error, { color: t.muted }]}>{friendlyError(error)}</Text>
        <Pressable onPress={() => setAttempt((a) => a + 1)} style={[styles.retry, { backgroundColor: t.accent }]}>
          <Text style={[styles.retryText, { color: t.onAccent }]}>↻ Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!data || dataFor !== reqKey) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Pressable onPress={backOrHome} hitSlop={12} style={[styles.floatBack, { top: insets.top + 8 }]}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <ActivityIndicator color={t.accent} size="large" />
        <Text style={[styles.loading, { color: t.secondary }]}>Resolving stream…</Text>
        {!!(data?.title || expectedTitle) && <Text style={[styles.loadingSub, { color: t.muted }]}>{data?.title || expectedTitle}</Text>}
      </View>
    );
  }

  const title = data.title || expectedTitle || 'Now Playing';
  const qualityRank = (q: string) => {
    const s = String(q || '').toUpperCase();
    if (/^AUTO$/.test(s)) return 100000;
    const m = s.match(/(\d{3,4})\s*P|(4K|2160)/i);
    if (!m) return 0;
    if (m[2]) return 10000;
    return parseInt(m[1], 10) || 0;
  };
  const seenSrc = new Set<string>();
  const direct = [...(data.sources || [])]
    .filter((s: any) => { if (!s?.url || seenSrc.has(s.url)) return false; seenSrc.add(s.url); return true; })
    .sort((a: any, b: any) => qualityRank(b.quality) - qualityRank(a.quality));
  const liveEmbeds: ExtServer[] = (data.embeds || []).map((e: any, i: number) => ({ key: `live-${i}`, label: e.label || `Server ${i + 1}`, url: e.url }));
  const fallbacks = (!isNetMirrorId && /^\d+$/.test(id)) ? tmdbEmbeds(id, isTV, season, episode) : [];
  const seen = new Set<string>();
  const embedList = [...liveEmbeds, ...fallbacks].filter((s) => {
    try {
      const h = new URL(s.url).hostname;
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    } catch { return true; }
  });
  const curLang = String(data.language || language || '').toLowerCase();
  const seenLang = new Set<string>();
  const langList: { language: string }[] = [
    ...(curLang ? [{ language: curLang }] : []),
    ...dubs,
  ]
    .map((d: any) => ({ language: String(d?.language || '').trim() }))
    .filter((d) => { const l = d.language.toLowerCase(); if (!l || seenLang.has(l)) return false; seenLang.add(l); return true; })
    .slice(0, 14);
  const qualities = direct.map((s: any, i: number) => ({ label: s.quality || 'Auto', active: i === active }));
  const subsList: { label?: string; url: string }[] = (Array.isArray(data?.subtitles) ? data.subtitles : []).filter((s: any) => s && typeof s.url === 'string' && s.url);
  const epsKey = `${tmdbId}|${pickSeason}`;
  const epsLoading = isTV && !!tmdbId && epsFor !== epsKey;
  const shownN = epsShown.key === epsKey ? epsShown.n : 20;
  const epsVisible = tvEps.slice(0, shownN);

  // Playback failover for the NetMirror CDN path: signed CDN URLs stall or
  // expire mid-watch. Try the next source, then re-resolve fresh (server
  // re-hits the mirrors and re-signs URLs), then leave it to the manual
  // server/quality list.
  const handlePlaybackFail = () => {
    if (active < direct.length - 1) {
      setFailNote('Stream stalled — switching source…');
      setActive(active + 1);
      return;
    }
    if (attempt < 2) {
      setFailNote('Reconnecting stream…');
      setAttempt(attempt + 1);
      return;
    }
    setFailNote('');
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.bg }]}>
      <View style={[styles.videoWrap, fsFull && styles.videoWrapFull, showParty && !fsFull && styles.videoWrapParty]}>
        {ext && extFor === reqKey ? (
          <WebView source={{ uri: ext.url }} style={styles.videoFill} allowsFullscreenVideo allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} />
        ) : direct.length ? (
          <Player
            key={`${id}-${attempt}-${season}-${episode}-${active}`}
            ref={playerRef}
            src={direct[Math.min(active, direct.length - 1)].url}
            onFail={handlePlaybackFail}
            autoRecover={active < direct.length - 1 || attempt < 2}
            title={title}
            subtitle={isTV ? `S${season} E${episode}` : (data.language || language || '').toUpperCase() || undefined}
            insetTop={insets.top}
            fullscreen={fsFull}
            onFsChange={setFsFull}
            inParty={inParty}
            isPartyHost={isPartyHost}
            onOpenParty={() => setShowParty(true)}
            qualities={qualities}
            subs={subsList}
            onSelectQuality={(i) => { setActive(i); setFailNote(`Quality: ${direct[i]?.quality || 'Auto'}`); }}
            onPlayPauseEvent={onPlayPauseEvent}
            onSeekEvent={onSeekEvent}
            nextLabel={isTV ? `S${season} E${episode + 1}` : undefined}
            onNext={isTV ? () => goEp(season, episode + 1) : undefined}
            tvSeasons={isTV ? tvSeasons : undefined}
            tvEpisodes={isTV ? tvEps : undefined}
            tvSeason={pickSeason}
            curSeason={season}
            curEpisode={episode}
            onPickSeason={setPickSeason}
            onPickEpisode={isTV ? goEp : undefined}
          />
        ) : (
          <View style={[styles.videoFill, styles.center, { backgroundColor: '#000' }]}>
            <ActivityIndicator color={t.accent} />
            <Text style={[styles.loadingSub, { color: t.muted }]}>Starting server…</Text>
          </View>
        )}
        {reaction && (
          <View style={[styles.reactionFloat, { top: insets.top + 52 }]}>
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            <Text style={styles.reactionSender} numberOfLines={1}>{reaction.sender}</Text>
          </View>
        )}
      </View>
      {!fsFull && (!direct.length || !!ext) && (
        <Pressable onPress={backOrHome} hitSlop={12} style={[styles.floatBack, { top: insets.top + 8 }]}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
      )}
      {failNote ? <Text style={[styles.loadingSub, { color: t.muted, textAlign: 'center', paddingTop: 6 }]}>{failNote}</Text> : null}
      <ScrollView style={styles.meta} contentContainerStyle={{ paddingBottom: 28 }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{title}</Text>
        {!!(data.language || language) && <Text style={[styles.sub, { color: t.accent }]}>{String(data.language || language).toUpperCase()}</Text>}
        <View style={styles.row}>
          <Pressable onPress={() => setExt(null)} style={[styles.tab, !ext && { borderBottomWidth: 2, borderBottomColor: t.accent }]}>
            <Text style={[styles.tabText, { color: !ext ? t.text : t.secondary }]}>NetMirror</Text>
          </Pressable>
          {embedList.map((s) => (
            <Pressable key={s.key} onPress={() => setExt(s)} style={[styles.tab, ext?.key === s.key && { borderBottomWidth: 2, borderBottomColor: t.accent }]}>
              <Text style={[styles.tabText, { color: ext?.key === s.key ? t.text : t.secondary }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
        {direct.length > 1 && !ext && (
          <View style={styles.row}>
            {direct.map((s: any, i: number) => (
              <Pressable key={i} onPress={() => setActive(i)} style={[styles.tab, i === active && { borderBottomWidth: 2, borderBottomColor: t.accent }]}>
                <Text style={[styles.tabText, { color: i === active ? t.text : t.secondary }]}>{s.quality || 'Auto'}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {isTV && (
          <View style={styles.row}>
            <Pressable onPress={() => episode > 1 && goEp(season, episode - 1)} disabled={episode <= 1} style={styles.tab}>
              <Text style={[styles.tabText, { color: t.secondary, opacity: episode <= 1 ? 0.35 : 1 }]}>‹ Prev</Text>
            </Pressable>
            <Pressable onPress={() => { setPickSeason(season); setShowEpsList(true); }} style={styles.tab}>
              <Text style={[styles.tabText, { color: t.accent }]}>S{season} E{episode} ▾</Text>
            </Pressable>
            <Pressable onPress={() => goEp(season, episode + 1)} style={styles.tab}>
              <Text style={[styles.tabText, { color: t.secondary }]}>Next ›</Text>
            </Pressable>
          </View>
        )}
        {langList.length > 0 && (
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: t.muted }]}>Audio</Text>
            {langList.map((d, i) => {
              const on = d.language.toLowerCase() === curLang;
              return (
                <Pressable key={`${d.language}-${i}`} onPress={() => { if (!on) goLang(d.language); }} disabled={on} style={[styles.tab, on && { borderBottomWidth: 2, borderBottomColor: t.accent }]}>
                  <Text style={[styles.tabText, { color: on ? t.accent : t.secondary }]}>{d.language.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {isTV && (tvSeasons.length > 0 || tvEps.length > 0) && (
          <View style={{ marginTop: 18 }}>
            <Pressable onPress={() => setEpsOpen((o) => !o)} hitSlop={8} style={styles.epsHead}>
              <Text style={[styles.recTitle, { color: t.text, marginBottom: 0 }]}>
                Episodes{!epsLoading && tvEps.length ? ` · ${tvEps.length} in S${pickSeason}` : ''}
              </Text>
              <Ionicons name={epsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={t.muted} />
            </Pressable>
            {epsOpen && (
              <>
                {tvSeasons.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: 'row' }}>
                      {tvSeasons.map((s: any) => {
                        const on = pickSeason === s.season_number;
                        return (
                          <Pressable key={s.season_number} onPress={() => setPickSeason(s.season_number)} style={[styles.tab, on && { borderBottomWidth: 2, borderBottomColor: t.accent }]}>
                            <Text style={[styles.tabText, { color: on ? t.text : t.secondary }]}>S{s.season_number}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
                {epsLoading && !tvEps.length && <Text style={[styles.epsNote, { color: t.muted }]}>Loading episodes…</Text>}
                {!epsLoading && !tvEps.length && <Text style={[styles.epsNote, { color: t.muted }]}>No episodes listed for this season.</Text>}
                {(epsLoading ? [] : epsVisible).map((ep: any) => {
                  const isCur = season === pickSeason && episode === ep.episode_number;
                  return (
                    <Pressable key={ep.id ?? `e${ep.episode_number}`} onPress={() => goEp(pickSeason, ep.episode_number)} style={styles.epRowN}>
                      <Text style={[styles.epNum, { color: isCur ? t.accent : t.muted }]}>{ep.episode_number}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.epName, { color: isCur ? t.accent : t.text }]} numberOfLines={2}>{ep.name || `Episode ${ep.episode_number}`}</Text>
                        {!!ep.air_date && <Text style={[styles.epDate, { color: t.muted }]}>{ep.air_date}</Text>}
                      </View>
                      {isCur && <Text style={[styles.epNow, { color: t.accent }]}>PLAYING</Text>}
                    </Pressable>
                  );
                })}
                {!epsLoading && tvEps.length > shownN && (
                  <Pressable onPress={() => setEpsShown({ key: epsKey, n: shownN + 24 })} style={styles.showMore}>
                    <Text style={[styles.showMoreText, { color: t.accent }]}>Show more · {tvEps.length - shownN} left</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}
        {recs.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.recTitle, { color: t.text }]}>More Like This</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {recs.map((item: any, i: number) => (
                <View key={`${item?.id ?? i}-${item?.media_type || ''}`} style={{ marginRight: 12 }}>
                  <PosterCard item={item} width={120} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
      {isTV && (
        <EpisodesPicker
          visible={showEpsList}
          onClose={() => setShowEpsList(false)}
          padTop={insets.top + 52}
          t={t}
          seasons={tvSeasons}
          episodes={tvEps}
          tvSeason={pickSeason}
          curSeason={season}
          curEpisode={episode}
          onPickSeason={setPickSeason}
          onPickEpisode={goEp}
        />
      )}
      <WatchPartySheet
        visible={showParty}
        onClose={() => setShowParty(false)}
        mediaTitle={title}
        mediaId={id}
        mediaType={type}
        season={season}
        episode={episode}
        getTime={() => playerRef.current?.getTime() ?? 0}
        isPlaying={() => playerRef.current?.isPlaying() ?? false}
        onRemoteSync={onRemoteSync}
        onRemoteSeek={onRemoteSeek}
        onRemoteMediaChange={onRemoteMediaChange}
      />
    </View>
  );
}

function friendlyError(raw: string): string {
  const msg = String(raw || '');
  if (!msg) return 'Something went wrong with this stream. Try another server or Retry.';
  if (/resolve_miss|no[_\s-]?results?|no[_\s-]?sources?|no[_\s-]?stream|missing_id/i.test(msg)) {
    return 'Title not found on our sources right now. Try a Server below — brand-new releases can take a while to appear.';
  }
  if (/fetch_failed|failed to fetch|network|timeout|timed out|offline|load failed/i.test(msg)) {
    return "Couldn't reach our servers. Check your connection, then hit Retry.";
  }
  if (/media_source_failed|dash_|manifest|hevc|decode|black screen|embed_failed|harvest_failed/i.test(msg)) {
    return "This file wouldn't play on your device. Try another Server below.";
  }
  return 'Something went wrong with this stream. Try another server or Retry.';
}

function contentTypeFor(url: string) {
  const u = String(url || '').toLowerCase();
  if (u.includes('.m3u8')) return 'hls';
  if (u.includes('.mpd')) return 'dash';
  return 'auto';
}

// Gated-host list + referer come from the backend's /api/netmirror/cdns at
// runtime; nothing CDN-specific is hardcoded here.
function headersFor(url: string): Record<string, string> | undefined {
  try {
    const host = new URL(url).hostname;
    const cfg = getCdnCfg();
    if (!cfg.referer) return undefined;
    const gated = cfg.gatedHosts.some((d) => host === d || host.endsWith('.' + d));
    if (gated) return { Referer: cfg.referer, Origin: cfg.referer.replace(/\/+$/, '') };
  } catch { /* relative/malformed URL — no headers */ }
  return undefined;
}

export type PlayerHandle = {
  seek: (t: number) => void;
  seekBy: (d: number) => void;
  getTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  play: () => void;
  pause: () => void;
};

type PlayerProps = {
  ref?: React.Ref<PlayerHandle>;
  src: string;
  onFail?: () => void;
  autoRecover?: boolean;
  title: string;
  subtitle?: string;
  insetTop: number;
  inParty: boolean;
  isPartyHost: boolean;
  onOpenParty: () => void;
  qualities: { label: string; active: boolean }[];
  subs: { label?: string; url: string }[];
  onSelectQuality: (index: number) => void;
  onPlayPauseEvent: (playing: boolean) => void;
  onSeekEvent: (time: number) => void;
  nextLabel?: string;
  onNext?: () => void;
  fullscreen?: boolean;
  onFsChange?: (v: boolean) => void;
  tvSeasons?: any[];
  tvEpisodes?: any[];
  tvSeason?: number;
  curSeason?: number;
  curEpisode?: number;
  onPickSeason?: (s: number) => void;
  onPickEpisode?: (s: number, e: number) => void;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const EMPTY_CUES: Cue[] = [];

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
}

// Custom, ArtPlayer-style control overlay: center play + ±10s, scrub bar with
// buffered fill, time, speed / quality / subtitles sheet, party, PiP and
// fullscreen — video sits YouTube-style edge-to-edge at a 16:9 top block.
/* eslint-disable react-hooks/immutability, react-hooks/refs -- expo-video's player is an imperative object: these controls are its driver, and the ref bridge republishes live playback state for party sync */
function Player({
  ref, src, onFail, autoRecover, title, subtitle, insetTop, inParty, isPartyHost,
  onOpenParty, qualities, subs, onSelectQuality, onPlayPauseEvent, onSeekEvent, nextLabel, onNext,
  fullscreen = false, onFsChange,
  tvSeasons, tvEpisodes, tvSeason, curSeason, curEpisode, onPickSeason, onPickEpisode,
}: PlayerProps) {
  const { t, prefs } = usePrefs();
  // Landscape (our custom fullscreen) gets the full transport; portrait stays
  // minimal — top bar + scrub + one button row, no center overlay to collide.
  const { width: winW, height: winH } = useWindowDimensions();
  const wide = winW > winH;
  const player = useVideoPlayer({ uri: src, contentType: contentTypeFor(src), headers: headersFor(src) } as any, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
    // Buffer 30s ahead but start at a 1s runway so streams open fast; 1s seek
    // tolerance lets the decoder snap to keyframes instead of re-buffering for
    // an exact frame on every scrub release.
    p.bufferOptions = { preferredForwardBufferDuration: 30, minBufferForPlayback: 1, prioritizeTimeOverSizeThreshold: true };
    p.seekTolerance = { toleranceBefore: 1, toleranceAfter: 1 };
    p.play();
  });
  // Background playback is a player property, not a source option — apply it
  // live from prefs (the Settings toggle) without recreating the player.
  useEffect(() => {
    try { player.staysActiveInBackground = !!prefs.bgPlay; } catch {}
  }, [player, prefs.bgPlay]);
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [controls, setControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [showEps, setShowEps] = useState(false);
  // ExoPlayer reports the pre-seek position for a few ticks after a seek; hold
  // the bar on the requested target until the engine catches up.
  const seekStampRef = useRef<{ target: number; until: number } | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);
  const [activeTrack, setActiveTrack] = useState<any>(null);
  const [seekHint, setSeekHint] = useState<number | null>(null);
  const [pipNote, setPipNote] = useState(false);
  const [nextCancelled, setNextCancelled] = useState(false);
  const [subIdx, setSubIdx] = useState(-1);
  const [fetchedCues, setFetchedCues] = useState<{ url: string; cues: Cue[] } | null>(null);
  const [subStyle, setSubStyle] = useState<SubStyle>(SUB_STYLE_DEFAULT);
  const userOff = useRef(false);
  const cueCache = useRef(new Map<string, Cue[]>());
  const videoViewRef = useRef<VideoView>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const failRef = useRef(onFail);
  const lastTap = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { failRef.current = onFail; }, [onFail]);

  // Custom fullscreen — our overlay (subtitles, bars, scrims) rides along and
  // the device rotates; the system fullscreen would take the whole screen over.
  useEffect(() => {
    if (fullscreen) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [fullscreen]);
  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onFsChange?.(false); return true; });
    return () => sub.remove();
  }, [fullscreen, onFsChange]);

  // ── Subtitle engine — custom overlay mirroring the web player's styling ──
  // Default to the first track once subs arrive; honor an explicit user Off.
  const activeSubIdx = subIdx < 0 && !userOff.current && subs.length ? 0 : subIdx;
  const subUrl = activeSubIdx >= 0 ? subs[activeSubIdx]?.url || '' : '';

  useEffect(() => {
    if (!subUrl || cueCache.current.has(subUrl)) return;
    let alive = true;
    (async () => {
      try {
        // Backend subtitle entries can be relative (/api/netmirror/subs-get?fid=…)
        // or absolute (OpenSubtitles); the proxy needs an absolute target.
        const abs = /^https?:\/\//i.test(subUrl) ? subUrl : `${getApiBase()}${subUrl.startsWith('/') ? '' : '/'}${subUrl}`;
        const r = await fetch(`${getApiBase()}/proxy/subtitle?url=${encodeURIComponent(abs)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const parsed = parseVtt(await r.text());
        cueCache.current.set(subUrl, parsed);
        if (alive) setFetchedCues({ url: subUrl, cues: parsed });
      } catch { /* overlay stays empty; switching track retries */ }
    })();
    return () => { alive = false; };
  }, [subUrl]);
  const cues = subUrl
    ? cueCache.current.get(subUrl) || (fetchedCues?.url === subUrl ? fetchedCues.cues : EMPTY_CUES)
    : EMPTY_CUES;

  // Our overlay replaces native rendering when the engine has tracks — stops
  // ExoPlayer's auto-selected manifest track from double-rendering.
  useEffect(() => {
    if (subs.length && player.subtitleTrack) player.subtitleTrack = null;
  }, [subs.length, status, player]);
  useEventListener(player, 'availableSubtitleTracksChange', useCallback(() => {
    if (subs.length && player.subtitleTrack) player.subtitleTrack = null;
  }, [subs.length, player]));

  // One global subtitle look, persisted across sessions.
  useEffect(() => {
    AsyncStorage.getItem('kakumei.subs.style')
      .then((v) => {
        if (!v) return;
        try {
          const s = JSON.parse(v);
          if (s && typeof s === 'object') setSubStyle((prev) => ({ ...prev, ...s }));
        } catch { /* corrupt prefs — keep defaults */ }
      })
      .catch(() => {});
  }, []);
  const patchSubStyle = (patch: Partial<SubStyle>) => {
    setSubStyle((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem('kakumei.subs.style', JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  useEventListener(player, 'timeUpdate', useCallback((p: any) => {
    const t = p?.currentTime ?? 0;
    const stamp = seekStampRef.current;
    if (stamp) {
      if (Math.abs(t - stamp.target) <= 2.5 || Date.now() >= stamp.until) seekStampRef.current = null;
    } else if (!scrubbing) {
      setPos(t);
    }
    if (typeof p?.bufferedPosition === 'number' && p.bufferedPosition >= 0) setBuffered(p.bufferedPosition);
    const d = player.duration;
    if (d && d > 0 && d !== dur) setDur(d);
    if (nextCancelled && d - t > 46) setNextCancelled(false);
  }, [scrubbing, dur, player, nextCancelled]));

  useEventListener(player, 'playToEnd', useCallback(() => {
    setControls(true);
    if (onNext) onNext();
  }, [onNext]));

  const pokeControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 3800);
  }, []);

  useEffect(() => {
    hideTimer.current = setTimeout(() => setControls(false), 3800);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  useEffect(() => {
    if (!isPlaying && hideTimer.current) {
      clearTimeout(hideTimer.current);
      setControls(true);
    }
  }, [isPlaying]);

  // Auto-reconnect: hard error or a stall longer than 18s hands over to the
  // source failover av + re-resolve.
  useEffect(() => {
    if (!error || firedRef.current) return;
    firedRef.current = true;
    failRef.current?.();
  }, [error]);

  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      failRef.current?.();
    }, 18000);
    return () => clearTimeout(timer);
  }, [status]);

  const seekTo = useCallback((time: number) => {
    const d = player.duration || 0;
    const clamped = Math.max(0, d > 0 ? Math.min(d - 0.5, time) : time);
    seekStampRef.current = { target: clamped, until: Date.now() + 1200 };
    player.currentTime = clamped;
    setPos(clamped);
    onSeekEvent(clamped);
  }, [player, onSeekEvent]);

  const skip = useCallback((delta: number) => {
    const target = (player.currentTime || 0) + delta;
    seekTo(target);
    pokeControls();
    setSeekHint(delta);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setSeekHint(null), 700);
  }, [player, seekTo, pokeControls]);

  useEffect(() => {
    if (!ref) return;
    (ref as any).current = {
      seek: (tv: number) => { player.currentTime = tv; setPos(tv); },
      seekBy: (d: number) => seekTo((player.currentTime || 0) + d),
      getTime: () => player.currentTime || 0,
      getDuration: () => player.duration || 0,
      isPlaying: () => player.playing,
      play: () => player.play(),
      pause: () => player.pause(),
    } satisfies PlayerHandle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const setRate = (r: number) => {
    player.playbackRate = r;
    setSpeed(r);
  };

  const openSettings = () => {
    setTracks(player.availableSubtitleTracks || []);
    setActiveTrack(player.subtitleTrack || null);
    setShowSettings(true);
  };

  const startPip = () => {
    try { videoViewRef.current?.startPictureInPicture(); } catch { setPipNote(true); setTimeout(() => setPipNote(false), 3000); }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setControls(true);
        setScrubbing(true);
        const d = playerRef.current?.duration || 0;
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / Math.max(1, trackWRef.current)));
        setScrubTime(ratio * d);
      },
      onPanResponderMove: (evt) => {
        const d = playerRef.current?.duration || 0;
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / Math.max(1, trackWRef.current)));
        setScrubTime(ratio * d);
      },
      onPanResponderRelease: (evt) => {
        const d = playerRef.current?.duration || 0;
        setScrubbing(false);
        pokeRef.current();
        if (d <= 0) return;
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / Math.max(1, trackWRef.current)));
        seekToRef.current(ratio * d);
      },
      // Android can cancel the gesture (modal/sheet steal) — never leave the
      // bar in scrubbing state, or playback position freezes.
      onPanResponderTerminate: () => setScrubbing(false),
    }),
  ).current;
  const trackWRef = useRef(1);
  const playerRef = useRef(player);
  playerRef.current = player;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;
  const pokeRef = useRef(pokeControls);
  pokeRef.current = pokeControls;

  const handleTap = (delta: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      skip(delta);
    } else {
      setControls((c) => !c);
    }
    lastTap.current = now;
  };

  const subLine = cues.length ? cueTextAt(cues, (scrubbing ? scrubTime : pos) - subStyle.sync) : null;
  const progress = dur > 0 ? Math.min(1, (scrubbing ? scrubTime : pos) / dur) : 0;
  const bufferRatio = dur > 0 ? Math.min(1, buffered / dur) : 0;
  const buffering = status === 'loading' || status === 'idle';

  return (
    <View style={styles.playerRoot}>
      <VideoView
        ref={videoViewRef}
        style={styles.videoFill}
        player={player}
        nativeControls={false}
        allowsPictureInPicture
        contentFit="contain"
      />

      {/* Tap layer: single tap toggles controls, double tap seeks ±10s. */}
      <View style={styles.tapLayer}>
        <Pressable style={styles.tapZone} onPress={() => handleTap(-10)} />
        <Pressable style={styles.tapZone} onPress={() => handleTap(10)} />
      </View>

      {/* Premium scrims — controls fade into the video, not hard bars. */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.82)', 'rgba(0,0,0,0)']} style={[styles.topScrim, { height: Math.max(insetTop, 10) + 84 }]} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']} style={styles.bottomScrim} />

      {buffering && (
        <View style={styles.bufferOverlay} pointerEvents="none">
          <ActivityIndicator color={t.accent} size="large" />
          <Text style={[styles.loadingSub, { color: t.muted }]}>Buffering…</Text>
        </View>
      )}

      {seekHint !== null && (
        <View style={styles.seekHint} pointerEvents="none">
          <Text style={styles.seekHintText}>{seekHint > 0 ? '+10s' : '-10s'}</Text>
        </View>
      )}

      {subLine ? (
        <View style={[styles.subOverlay, { bottom: subStyle.position + (fullscreen ? 80 : controls ? 66 : 0) }]} pointerEvents="none">
          <Text style={[styles.subText, { fontSize: subStyle.size, color: subStyle.color }]}>{subLine}</Text>
        </View>
      ) : null}

      {!!onNext && dur > 0 && dur - pos > 3 && dur - pos <= 45 && !nextCancelled && (
        <View style={[styles.nextChip, { bottom: fullscreen ? 140 : 92 }]}>
          <Text style={styles.nextChipText}>Next episode in {Math.ceil(dur - pos)}s</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Pressable onPress={onNext} style={[styles.nextChipBtn, { backgroundColor: t.accent }]}>
              <Text style={[styles.nextChipBtnText, { color: t.onAccent }]}>Play now</Text>
            </Pressable>
            <Pressable onPress={() => setNextCancelled(true)} style={[styles.nextChipBtn, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Text style={styles.nextChipBtnText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!!error && !autoRecover && (
        <Text style={[styles.hiccup, { color: t.danger }]}>Playback hiccup — switch server below.</Text>
      )}

      {pipNote && (
        <Text style={[styles.hiccup, { color: '#f59e0b' }]}>Picture-in-picture is not supported on this device.</Text>
      )}

      {controls && (
        <>
          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: insetTop + 6 }]}>
            <Pressable onPress={() => { if (fullscreen) onFsChange?.(false); else backOrHome(); }} hitSlop={12} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={styles.topSub} numberOfLines={1}>{subtitle}</Text>}
            </View>
            {!!onPickEpisode && (
              <Pressable onPress={() => { onPickSeason?.(curSeason || 1); setShowEps(true); }} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                <Ionicons name="list" size={20} color="#e5e7eb" />
              </Pressable>
            )}
            {qualities.length > 0 && (
              <Pressable onPress={openSettings} hitSlop={10} style={({ pressed }) => [styles.qualBadge, pressed && { opacity: 0.7 }]}>
                <Text style={styles.qualBadgeText} numberOfLines={1}>{qualities.find((q) => q.active)?.label || 'Auto'}</Text>
              </Pressable>
            )}
            <Pressable onPress={onOpenParty} hitSlop={12} style={({ pressed }) => [styles.iconBtn, inParty && { backgroundColor: t.accentSoft }, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
              <Ionicons name="people" size={19} color={inParty ? '#fff' : '#e5e7eb'} />
              {inParty && <View style={[styles.hostDot, { backgroundColor: isPartyHost ? '#f59e0b' : '#22c55e' }]} />}
            </Pressable>
          </View>

          {/* Center transport — landscape only; portrait keeps the video area clear */}
          {wide && (
          <View style={styles.centerRow}>
            <Pressable onPress={() => skip(-10)} style={styles.sideBtn} hitSlop={8}>
              <Ionicons name="play-back" size={26} color="#fff" />
              <Text style={styles.sideBtnText}>10</Text>
            </Pressable>
            <Pressable onPress={() => { if (player.playing) player.pause(); else player.play(); pokeControls(); }} style={[styles.playBtn, { backgroundColor: t.accent }]}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color="#fff" style={!isPlaying ? { marginLeft: 3 } : undefined} />
            </Pressable>
            <Pressable onPress={() => skip(10)} style={styles.sideBtn} hitSlop={8}>
              <Ionicons name="play-forward" size={26} color="#fff" />
              <Text style={styles.sideBtnText}>10</Text>
            </Pressable>
            {!!onNext && (
              <Pressable onPress={onNext} style={[styles.sideBtn, { marginLeft: 18 }]} hitSlop={8}>
                <Ionicons name="play-skip-forward" size={22} color="#fff" />
                {!!nextLabel && <Text style={styles.sideBtnText}>Next</Text>}
              </Pressable>
            )}
          </View>
          )}

          {/* Bottom bar */}
          <View style={styles.bottomBar}>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{fmtTime(scrubbing ? scrubTime : pos)}</Text>
              <View
                style={styles.track}
                onLayout={(e) => { trackWRef.current = e.nativeEvent.layout.width || 1; }}
                {...pan.panHandlers}
              >
                <View style={[styles.trackBuffered, { width: `${bufferRatio * 100}%` }]} />
                <View style={[styles.trackPlayed, { width: `${progress * 100}%`, backgroundColor: t.accent }]} />
                <View style={[styles.trackThumb, { left: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.timeText}>{fmtTime(dur)}</Text>
            </View>
            <View style={styles.btnRow}>
              {wide ? (
                <>
                  <Pressable onPress={() => setRate(speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1)} style={({ pressed }) => [styles.textBtn, pressed && { opacity: 0.6 }]} hitSlop={12}>
                    <Text style={styles.textBtnLabel}>{speed}x</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={onOpenParty} hitSlop={12} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                    <Ionicons name={inParty ? 'people' : 'people-outline'} size={20} color={inParty ? t.accent : '#fff'} />
                    {inParty && <View style={[styles.hostDot, { backgroundColor: isPartyHost ? '#f59e0b' : '#22c55e' }]} />}
                  </Pressable>
                  <Pressable onPress={openSettings} hitSlop={12} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                    <Ionicons name="settings-outline" size={20} color="#fff" />
                  </Pressable>
                  <Pressable onPress={startPip} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]} hitSlop={12}>
                    <Ionicons name="browsers-outline" size={20} color="#fff" />
                  </Pressable>
                  <Pressable onPress={() => onFsChange?.(!fullscreen)} style={styles.iconBtn} hitSlop={12}>
                    <Ionicons name={fullscreen ? 'contract' : 'expand'} size={22} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => skip(-10)} style={styles.sideBtn} hitSlop={8}>
                    <Ionicons name="play-back" size={22} color="#fff" />
                  </Pressable>
                  <Pressable onPress={() => { if (player.playing) player.pause(); else player.play(); pokeControls(); }} style={[styles.playBtnMini, { backgroundColor: t.accent }]} hitSlop={8}>
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" style={!isPlaying ? { marginLeft: 2 } : undefined} />
                  </Pressable>
                  <Pressable onPress={() => skip(10)} style={styles.sideBtn} hitSlop={8}>
                    <Ionicons name="play-forward" size={22} color="#fff" />
                  </Pressable>
                  {!!onNext && (
                    <Pressable onPress={onNext} style={styles.sideBtn} hitSlop={8}>
                      <Ionicons name="play-skip-forward" size={20} color="#fff" />
                    </Pressable>
                  )}
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={openSettings} hitSlop={12} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
                    <Ionicons name="settings-outline" size={20} color="#fff" />
                  </Pressable>
                  <Pressable onPress={() => onFsChange?.(!fullscreen)} style={styles.iconBtn} hitSlop={12}>
                    <Ionicons name="expand" size={22} color="#fff" />
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </>
      )}

      {/* Player settings — compact popover like the web player: quality,
          speed, subtitle track/styling, watch party. */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <View style={[styles.modalWrap, { paddingTop: insetTop + 52 }]}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSettings(false)} />
        <View style={[styles.sheet, { backgroundColor: 'rgba(9,9,14,0.98)', borderColor: t.border }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Player</Text>
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            {qualities.length > 1 && (
              <>
                <Text style={[styles.sheetSection, { color: t.muted }]}>QUALITY</Text>
                {qualities.map((q, i) => (
                  <Pressable key={`${q.label}-${i}`} onPress={() => { onSelectQuality(i); setShowSettings(false); }} style={styles.optionRow}>
                    <Text style={[styles.optionText, { color: q.active ? t.accent : t.text, flex: 1 }]}>{q.label}</Text>
                    {q.active && <Ionicons name="checkmark" size={18} color={t.accent} />}
                  </Pressable>
                ))}
              </>
            )}
            <Text style={[styles.sheetSection, { color: t.muted }]}>SPEED</Text>
            <View style={styles.optionWrap}>
              {SPEEDS.map((r) => (
                <Pressable key={r} onPress={() => setRate(r)} style={[styles.optionChip, speed === r && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                  <Text style={[styles.optionText, { color: speed === r ? t.accent : t.secondary }]}>{r}x</Text>
                </Pressable>
              ))}
            </View>

            {subs.length > 0 ? (
              <>
                <Text style={[styles.sheetSection, { color: t.muted }]}>SUBTITLES</Text>
                <View style={styles.optionWrap}>
                  <Pressable onPress={() => { userOff.current = true; setSubIdx(-1); }} style={[styles.optionChip, activeSubIdx < 0 && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                    <Text style={[styles.optionText, { color: activeSubIdx < 0 ? t.accent : t.secondary }]}>Off</Text>
                  </Pressable>
                  {subs.map((s, i) => (
                    <Pressable key={`${s.url}-${i}`} onPress={() => { userOff.current = false; setSubIdx(i); }} style={[styles.optionChip, activeSubIdx === i && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                      <Text style={[styles.optionText, { color: activeSubIdx === i ? t.accent : t.secondary }]}>{(s.label || `Track ${i + 1}`).slice(0, 18)}</Text>
                    </Pressable>
                  ))}
                </View>
                {activeSubIdx >= 0 && (
                  <>
                    <Text style={[styles.sheetSection, { color: t.muted }]}>TEXT COLOR</Text>
                    <View style={styles.optionWrap}>
                      {SUB_COLORS.map((c) => (
                        <Pressable key={c.value} onPress={() => patchSubStyle({ color: c.value })} accessibilityLabel={c.label} style={[styles.colorDot, { backgroundColor: c.value }, subStyle.color === c.value && { borderColor: t.accent, borderWidth: 3 }]} />
                      ))}
                    </View>
                    <SliderBar label="TEXT SIZE" value={subStyle.size} min={SUB_RANGES.size.min} max={SUB_RANGES.size.max} step={SUB_RANGES.size.step} display={`${Math.round(subStyle.size)} px`} accent={t.accent} onChange={(n) => patchSubStyle({ size: n })} />
                    <SliderBar label="POSITION" value={subStyle.position} min={SUB_RANGES.position.min} max={SUB_RANGES.position.max} step={SUB_RANGES.position.step} display={`${Math.round(subStyle.position)} px`} accent={t.accent} onChange={(n) => patchSubStyle({ position: n })} />
                    <SliderBar label="SYNC" value={subStyle.sync} min={SUB_RANGES.sync.min} max={SUB_RANGES.sync.max} step={SUB_RANGES.sync.step} display={`${subStyle.sync > 0 ? '+' : ''}${subStyle.sync.toFixed(1)}s`} accent={t.accent} onChange={(n) => patchSubStyle({ sync: n })} />
                  </>
                )}
              </>
            ) : tracks.length > 0 ? (
              <>
                <Text style={[styles.sheetSection, { color: t.muted }]}>SUBTITLES</Text>
                <Pressable onPress={() => { player.subtitleTrack = null; setActiveTrack(null); }} style={styles.optionRow}>
                  <Text style={[styles.optionText, { color: activeTrack === null ? t.accent : t.text, flex: 1 }]}>Off</Text>
                  {activeTrack === null && <Ionicons name="checkmark" size={18} color={t.accent} />}
                </Pressable>
                {tracks.map((tr: any, i: number) => (
                  <Pressable key={`${tr?.language || i}-${i}`} onPress={() => { player.subtitleTrack = tr; setActiveTrack(tr); }} style={styles.optionRow}>
                    <Text style={[styles.optionText, { color: activeTrack === tr ? t.accent : t.text, flex: 1 }]}>
                      {tr?.label || tr?.language || `Track ${i + 1}`}
                    </Text>
                    {activeTrack === tr && <Ionicons name="checkmark" size={18} color={t.accent} />}
                  </Pressable>
                ))}
                <Text style={[styles.sheetNote, { color: t.muted }]}>Device-rendered track — our styled subtitle options appear when the stream ships its subtitle pack.</Text>
              </>
            ) : (
              <Text style={[styles.sheetNote, { color: t.muted }]}>Subtitles appear here when the stream ships them.</Text>
            )}

            <Text style={[styles.sheetSection, { color: t.muted }]}>PLAYBACK</Text>
            <Pressable onPress={() => { setShowSettings(false); startPip(); }} style={styles.optionRow}>
              <Ionicons name="browsers-outline" size={18} color={t.text} style={{ marginRight: 10 }} />
              <Text style={[styles.optionText, { color: t.text, flex: 1 }]}>Picture-in-picture</Text>
              <Ionicons name="open-outline" size={15} color={t.muted} />
            </Pressable>

            <Text style={[styles.sheetSection, { color: t.muted }]}>WATCH PARTY</Text>
            <Pressable onPress={() => { setShowSettings(false); onOpenParty(); }} style={styles.optionRow}>
              <Ionicons name="people-outline" size={18} color={inParty ? t.accent : t.text} style={{ marginRight: 10 }} />
              <Text style={[styles.optionText, { color: t.text, flex: 1 }]}>{inParty ? 'In a watch party — open controls' : 'Watch together with friends'}</Text>
              <Ionicons name="chevron-forward" size={16} color={t.muted} />
            </Pressable>
          </ScrollView>
        </View>
        </View>
      </Modal>

      <EpisodesPicker
        visible={showEps}
        onClose={() => setShowEps(false)}
        padTop={insetTop + 52}
        t={t}
        seasons={tvSeasons}
        episodes={tvEpisodes}
        tvSeason={tvSeason}
        curSeason={curSeason}
        curEpisode={curEpisode}
        onPickSeason={onPickSeason}
        onPickEpisode={onPickEpisode}
      />
    </View>
  );
}

// Episode picker — jump straight to any season/episode instead of chaining
// Next through a whole season. Shared by the player overlay and the screen.
// Season dropdown + search keep long anime runs navigable without scrolling.
function EpisodesPicker({ visible, onClose, padTop, t, seasons, episodes, tvSeason, curSeason, curEpisode, onPickSeason, onPickEpisode }: {
  visible: boolean; onClose: () => void; padTop?: number; t: any;
  seasons?: any[]; episodes?: any[]; tvSeason?: number; curSeason?: number; curEpisode?: number;
  onPickSeason?: (s: number) => void; onPickEpisode?: (s: number, e: number) => void;
}) {
  const sid = tvSeason || 1;
  const [filter, setFilter] = useState('');
  const [seasonOpen, setSeasonOpen] = useState(false);
  const close = () => { setFilter(''); setSeasonOpen(false); onClose(); };
  const f = filter.trim().toLowerCase();
  const list = (episodes || []).filter((ep: any) => !f
    || String(ep?.episode_number) === f
    || String(ep?.episode_number || '').startsWith(f)
    || String(ep?.name || '').toLowerCase().includes(f));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.modalWrap, { paddingTop: padTop ?? 60 }]}>
        <Pressable style={styles.modalBackdrop} onPress={close} />
        <View style={[styles.sheet, { backgroundColor: 'rgba(9,9,14,0.98)', borderColor: t.border }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Episodes</Text>
          <View style={styles.pickerHead}>
            {(seasons?.length || 0) > 1 ? (
              <Pressable onPress={() => setSeasonOpen((o) => !o)} style={[styles.seasonBtn, { borderColor: seasonOpen ? t.accent : t.border }]}>
                <Text style={{ color: t.text, fontSize: 13, fontWeight: '800' }}>Season {sid}</Text>
                <Ionicons name={seasonOpen ? 'chevron-up' : 'chevron-down'} size={14} color={t.muted} />
              </Pressable>
            ) : <View style={{ flex: 1 }} />}
            <View style={[styles.searchBox, { borderColor: t.border }]}>
              <Ionicons name="search" size={14} color={t.muted} />
              <TextInput
                value={filter}
                onChangeText={setFilter}
                placeholder="Search episodes"
                placeholderTextColor={t.muted}
                autoCorrect={false}
                style={[styles.searchInput, { color: t.text }]}
              />
              {!!filter && <Pressable onPress={() => setFilter('')} hitSlop={8}><Ionicons name="close-circle" size={15} color={t.muted} /></Pressable>}
            </View>
          </View>
          {seasonOpen && (
            <ScrollView style={{ maxHeight: 168, marginBottom: 4 }} showsVerticalScrollIndicator={false}>
              {(seasons || []).map((s: any) => {
                const on = sid === s.season_number;
                return (
                  <Pressable key={s.season_number} onPress={() => { setSeasonOpen(false); onPickSeason?.(s.season_number); }} style={styles.optionRow}>
                    <Text style={[styles.optionText, { color: on ? t.accent : t.text, flex: 1 }]}>
                      Season {s.season_number}{s.episode_count ? ` · ${s.episode_count} eps` : ''}
                    </Text>
                    {on && <Ionicons name="checkmark" size={16} color={t.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {!(episodes?.length) && <Text style={[styles.sheetNote, { color: t.muted }]}>Fetching episode list…</Text>}
          {!!episodes?.length && !list.length && <Text style={[styles.sheetNote, { color: t.muted }]}>No episodes match “{filter.trim()}”.</Text>}
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {list.map((ep: any) => {
              const isCur = curEpisode === ep.episode_number && sid === (curSeason || 1);
              return (
                <Pressable key={ep.id ?? `e${ep.episode_number}`} onPress={() => { close(); onPickEpisode?.(sid, ep.episode_number); }} style={styles.epRowN}>
                  <Text style={[styles.epNum, { color: isCur ? t.accent : t.muted }]}>{ep.episode_number}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.epName, { color: isCur ? t.accent : t.text }]} numberOfLines={2}>{ep.name || `Episode ${ep.episode_number}`}</Text>
                    {!!ep.air_date && <Text style={[styles.epDate, { color: t.muted }]}>{ep.air_date}</Text>}
                  </View>
                  {isCur && <Ionicons name="play" size={14} color={t.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// Continuous control bar — subtitle size/position/sync are drag bars, not
// presets, so any caption track can be matched to the picture.
function SliderBar({ label, value, min, max, step, display, accent, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; display: string; accent: string; onChange: (n: number) => void;
}) {
  const wRef = useRef(1);
  const setFromX = useCallback((x: number) => {
    const ratio = Math.max(0, Math.min(1, x / wRef.current));
    let raw = min + ratio * (max - min);
    if (step) raw = Math.round(raw / step) * step;
    onChange(Math.round(raw * 1000) / 1000);
  }, [min, max, step, onChange]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: 'rgba(255,255,255,0.55)' }}>{label}</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>{display}</Text>
      </View>
      <View
        style={{ height: 26, justifyContent: 'center' }}
        onLayout={(e) => { wRef.current = e.nativeEvent.layout.width || 1; }}
        {...pan.panHandlers}
      >
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${ratio * 100}%`, borderRadius: 2, backgroundColor: accent }} />
          <View style={{ position: 'absolute', top: -5, left: `${ratio * 100}%`, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', marginLeft: -7 }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', position: 'relative', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden' },
  videoWrapParty: { width: '50%', borderBottomRightRadius: 0 },
  videoWrapFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  videoFill: { width: '100%', height: '100%', backgroundColor: '#000' },
  playerRoot: { flex: 1, position: 'relative' },
  tapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapZone: { flex: 1 },
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 8 },
  seekHint: { position: 'absolute', alignSelf: 'center', top: '44%', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  seekHintText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hiccup: { position: 'absolute', bottom: 6, alignSelf: 'center', fontSize: 12, fontWeight: '700' },
  floatBack: { position: 'absolute', left: 10, zIndex: 70, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingBottom: 4 },
  topTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  topSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hostDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  qualBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(0,0,0,0.35)', maxWidth: 76 },
  qualBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  nextChip: { position: 'absolute', right: 10, bottom: 92, backgroundColor: 'rgba(9,9,14,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: 12 },
  nextChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  nextChipBtn: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  nextChipBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  centerRow: { position: 'absolute', top: '34%', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  playBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  playBtnMini: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sideBtn: { alignItems: 'center', justifyContent: 'center', width: 42, height: 42 },
  sideBtnText: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '700', marginTop: 1 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeText: { color: '#e5e7eb', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 22, justifyContent: 'center' },
  trackBuffered: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', left: 0 },
  trackPlayed: { position: 'absolute', height: 4, borderRadius: 2, left: 0 },
  trackThumb: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: '#fff', marginLeft: -6 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  textBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  textBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  subOverlay: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  subText: { textAlign: 'center', fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' },
  modalWrap: { flex: 1, alignItems: 'flex-end', paddingRight: 10 },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { width: '92%', maxWidth: 360, maxHeight: '70%', borderRadius: 18, borderWidth: 1, padding: 14 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  seasonBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 1, minHeight: 36 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 7 },
  sheetTitle: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  sheetSection: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 10, marginBottom: 6 },
  sheetNote: { fontSize: 11, marginTop: 10 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2 },
  optionText: { fontSize: 13, fontWeight: '700' },
  reactionFloat: { position: 'absolute', right: 14, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  reactionEmoji: { fontSize: 24 },
  reactionSender: { color: 'rgba(255,255,255,0.8)', fontSize: 9, marginTop: 1, maxWidth: 90 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 10 },
  error: { textAlign: 'center', fontSize: 13 },
  errTitle: { fontSize: 20, fontWeight: '800' },
  loading: { fontSize: 14, marginTop: 4 },
  loadingSub: { fontSize: 12, marginTop: 2 },
  retry: { borderRadius: 14, paddingHorizontal: 26, paddingVertical: 12, marginTop: 8 },
  retryText: { fontSize: 15, fontWeight: '700' },
  meta: { paddingHorizontal: 16, paddingTop: 14, gap: 3 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  rowLabel: { width: '100%', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  tab: { paddingVertical: 6, marginRight: 16 },
  tabText: { fontSize: 13, fontWeight: '700' },
  epsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  epsNote: { fontSize: 12, marginTop: 10 },
  epRowN: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  epNum: { width: 30, fontSize: 17, fontWeight: '800' },
  epName: { fontSize: 14, fontWeight: '600' },
  epDate: { fontSize: 11, marginTop: 2 },
  epNow: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  showMore: { paddingVertical: 14, alignItems: 'center' },
  showMoreText: { fontSize: 13, fontWeight: '800' },
  recTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
});
