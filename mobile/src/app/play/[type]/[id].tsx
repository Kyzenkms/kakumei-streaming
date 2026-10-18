import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent, useEventListener } from 'expo';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getCdnCfg, loadCdnCfg } from '../../../api';
import { usePrefs } from '../../../prefs';
import { saveRecent } from '../../../recent';
import { PosterCard } from '../../../components/PosterCard';
import { WatchPartySheet } from '../../../components/WatchPartySheet';
import { party } from '../../../party/party';

type ExtServer = { key: string; label: string; url: string };

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
  const [failNote, setFailNote] = useState('');
  const [showParty, setShowParty] = useState(!!partyCodeParam);
  const [inParty, setInParty] = useState(!!party.roomId);
  const [isPartyHost, setIsPartyHost] = useState(party.isHost);
  const [reaction, setReaction] = useState<{ emoji: string; sender: string } | null>(null);
  const playerRef = useRef<PlayerHandle>(null);
  const partyNavRef = useRef(false);
  const autoJoinTried = useRef(false);
  const reqKey = `${type}|${id}|${season}|${episode}|${expectedTitle}|${pick(params.language) || ''}|${netmirror}|${attempt}`;

  const language = pick(params.language) || '';

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api.sources({ id, type, season, episode, title: expectedTitle, language, isNetMirror: isNetMirrorId, fresh: attempt > 0 })
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
        const match = (results || []).find((r: any) => !r.isNetMirror && (r.media_type || (r.isTV ? 'tv' : 'movie')) === type)
          || (results || []).find((r: any) => !r.isNetMirror);
        if (!match) return;
        const r = await api.recs(match.media_type || type, match.id);
        if (alive) setRecs((r || []).filter((x: any) => x && x.id && (x.poster_path || x.backdrop_path)).slice(0, 18));
      } catch { if (alive) setRecs([]); }
    })();
    return () => { alive = false; };
  }, [id, type, isNetMirrorId, expectedTitle, data?.title]);

  // Dub/language alternatives for this exact work (NetMirror catalog variants).
  useEffect(() => {
    const q = data?.title || expectedTitle;
    if (!q) return;
    let alive = true;
    api.languages(q).then((l) => { if (alive) setDubs(Array.isArray(l) ? l : []); }).catch(() => {});
    return () => { alive = false; };
  }, [data?.title, expectedTitle]);

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
  const altDubs = dubs.filter((d: any) => { const dl = String(d?.language || '').toLowerCase(); return dl && dl !== curLang; }).slice(0, 12);
  const qualities = direct.map((s: any, i: number) => ({ label: s.quality || 'Auto', active: i === active }));

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
      <View style={styles.videoWrap}>
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
            inParty={inParty}
            isPartyHost={isPartyHost}
            onOpenParty={() => setShowParty(true)}
            qualities={qualities}
            onSelectQuality={(i) => { setActive(i); setFailNote(`Quality: ${direct[i]?.quality || 'Auto'}`); }}
            onPlayPauseEvent={onPlayPauseEvent}
            onSeekEvent={onSeekEvent}
            nextLabel={isTV ? `S${season} E${episode + 1}` : undefined}
            onNext={isTV ? () => goEp(season, episode + 1) : undefined}
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
      {failNote ? <Text style={[styles.loadingSub, { color: t.muted, textAlign: 'center', paddingTop: 6 }]}>{failNote}</Text> : null}
      <ScrollView style={styles.meta} contentContainerStyle={{ paddingBottom: 28 }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>{title}</Text>
        {!!(data.language || language) && <Text style={[styles.sub, { color: t.accent }]}>{String(data.language || language).toUpperCase()}</Text>}
        <View style={styles.row}>
          <Pressable onPress={() => setExt(null)} style={[styles.chip, !ext && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
            <Text style={[styles.chipText, { color: !ext ? t.accent : t.secondary }]}>NetMirror</Text>
          </Pressable>
          {embedList.map((s) => (
            <Pressable key={s.key} onPress={() => setExt(s)} style={[styles.chip, ext?.key === s.key && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
              <Text style={[styles.chipText, { color: ext?.key === s.key ? t.accent : t.secondary }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
        {direct.length > 1 && !ext && (
          <View style={styles.row}>
            {direct.map((s: any, i: number) => (
              <Pressable key={i} onPress={() => setActive(i)} style={[styles.chip, i === active && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                <Text style={[styles.chipText, { color: i === active ? t.accent : t.secondary }]}>{s.quality || 'Auto'}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {isTV && (
          <View style={styles.row}>
            <Pressable onPress={() => episode > 1 && goEp(season, episode - 1)} disabled={episode <= 1} style={[styles.chip, episode <= 1 && { opacity: 0.35 }]}>
              <Text style={[styles.chipText, { color: t.secondary }]}>‹ Prev</Text>
            </Pressable>
            <View style={[styles.chip, { borderColor: t.border }]}>
              <Text style={[styles.chipText, { color: t.text }]}>S{season} E{episode}</Text>
            </View>
            <Pressable onPress={() => goEp(season, episode + 1)} style={styles.chip}>
              <Text style={[styles.chipText, { color: t.secondary }]}>Next ›</Text>
            </Pressable>
            <Pressable onPress={() => goEp(season + 1, 1)} style={styles.chip}>
              <Text style={[styles.chipText, { color: t.secondary }]}>S{season + 1} ▸</Text>
            </Pressable>
          </View>
        )}
        {altDubs.length > 0 && (
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: t.muted }]}>Languages</Text>
            {altDubs.map((d: any, i: number) => (
              <Pressable key={`${d?.id ?? d?.language ?? i}`} onPress={() => goLang(d.language)} style={styles.chip}>
                <Text style={[styles.chipText, { color: t.secondary }]}>{String(d.language || 'dub').toUpperCase()}</Text>
              </Pressable>
            ))}
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
  onSelectQuality: (index: number) => void;
  onPlayPauseEvent: (playing: boolean) => void;
  onSeekEvent: (time: number) => void;
  nextLabel?: string;
  onNext?: () => void;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  onOpenParty, qualities, onSelectQuality, onPlayPauseEvent, onSeekEvent, nextLabel, onNext,
}: PlayerProps) {
  const { t } = usePrefs();
  const player = useVideoPlayer({ uri: src, contentType: contentTypeFor(src), headers: headersFor(src) } as any, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.5;
    // Buffer 30s ahead but start at a 1s runway so streams open fast; 1s seek
    // tolerance lets the decoder snap to keyframes instead of re-buffering for
    // an exact frame on every scrub release.
    p.bufferOptions = { preferredForwardBufferDuration: 30, minBufferForPlayback: 1, prioritizeTimeOverSizeThreshold: true };
    p.seekTolerance = { toleranceBefore: 1, toleranceAfter: 1 };
    p.play();
  });
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
  const [tracks, setTracks] = useState<any[]>([]);
  const [activeTrack, setActiveTrack] = useState<any>(null);
  const [seekHint, setSeekHint] = useState<number | null>(null);
  const [fsExpanded, setFsExpanded] = useState(false);
  const [nextCancelled, setNextCancelled] = useState(false);
  const videoViewRef = useRef<VideoView>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const failRef = useRef(onFail);
  const lastTap = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { failRef.current = onFail; }, [onFail]);

  useEventListener(player, 'timeUpdate', useCallback((p: any) => {
    if (!scrubbing) setPos(p?.currentTime ?? 0);
    if (typeof p?.bufferedPosition === 'number' && p.bufferedPosition >= 0) setBuffered(p.bufferedPosition);
    const d = player.duration;
    if (d && d > 0 && d !== dur) setDur(d);
    if (nextCancelled && d - (p?.currentTime ?? 0) > 46) setNextCancelled(false);
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

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setScrubbing(true);
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWRef.current));
        setScrubTime(ratio * (playerRef.current?.duration || 0));
      },
      onPanResponderMove: (evt) => {
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWRef.current));
        setScrubTime(ratio * (playerRef.current?.duration || 0));
      },
      onPanResponderRelease: (evt) => {
        const ratio = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWRef.current));
        const target = ratio * (playerRef.current?.duration || 0);
        setScrubbing(false);
        seekToRef.current(target);
      },
    }),
  ).current;
  const trackWRef = useRef(1);
  const playerRef = useRef(player);
  playerRef.current = player;
  const seekToRef = useRef(seekTo);
  seekToRef.current = seekTo;

  const handleTap = (delta: number) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      skip(delta);
    } else {
      setControls((c) => !c);
    }
    lastTap.current = now;
  };

  const progress = dur > 0 ? Math.min(1, (scrubbing ? scrubTime : pos) / dur) : 0;
  const bufferRatio = dur > 0 ? Math.min(1, buffered / dur) : 0;
  const buffering = status === 'loading' || status === 'idle';

  return (
    <View style={styles.playerRoot}>
      <VideoView
        ref={videoViewRef}
        style={styles.videoFill}
        player={player}
        nativeControls={fsExpanded}
        allowsPictureInPicture
        fullscreenOptions={{ enable: true }}
        contentFit="contain"
        onFullscreenEnter={() => setFsExpanded(true)}
        onFullscreenExit={() => setFsExpanded(false)}
      />

      {/* Tap layer: single tap toggles controls, double tap seeks ±10s. */}
      <View style={styles.tapLayer}>
        <Pressable style={styles.tapZone} onPress={() => handleTap(-10)} />
        <Pressable style={styles.tapZone} onPress={() => handleTap(10)} />
      </View>

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

      {!!onNext && dur > 0 && dur - pos > 3 && dur - pos <= 45 && !nextCancelled && (
        <View style={styles.nextChip}>
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

      {controls && (
        <>
          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: insetTop + 6 }]}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
              {!!subtitle && <Text style={styles.topSub} numberOfLines={1}>{subtitle}</Text>}
            </View>
            {qualities.length > 0 && (
              <Pressable onPress={openSettings} hitSlop={8} style={styles.qualBadge}>
                <Text style={styles.qualBadgeText} numberOfLines={1}>{qualities.find((q) => q.active)?.label || 'Auto'}</Text>
              </Pressable>
            )}
            <Pressable onPress={onOpenParty} hitSlop={10} style={[styles.iconBtn, inParty && styles.iconBtnActive]}>
              <Ionicons name="people" size={19} color={inParty ? '#fff' : '#e5e7eb'} />
              {inParty && <View style={[styles.hostDot, { backgroundColor: isPartyHost ? '#f59e0b' : '#22c55e' }]} />}
            </Pressable>
          </View>

          {/* Center transport */}
          <View style={styles.centerRow}>
            <Pressable onPress={() => skip(-10)} style={styles.sideBtn} hitSlop={8}>
              <Ionicons name="play-back" size={26} color="#fff" />
              <Text style={styles.sideBtnText}>10</Text>
            </Pressable>
            <Pressable onPress={() => { if (player.playing) player.pause(); else player.play(); pokeControls(); }} style={styles.playBtn}>
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
                <View style={[styles.trackPlayed, { width: `${progress * 100}%` }]} />
                <View style={[styles.trackThumb, { left: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.timeText}>{fmtTime(dur)}</Text>
            </View>
            <View style={styles.btnRow}>
              <Pressable onPress={() => setRate(speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1)} style={styles.textBtn} hitSlop={8}>
                <Text style={styles.textBtnLabel}>{speed}x</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={openSettings} style={styles.iconBtn} hitSlop={8}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={() => { try { videoViewRef.current?.startPictureInPicture(); } catch {} }} style={styles.iconBtn} hitSlop={8}>
                <Ionicons name="browsers-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={() => { try { videoViewRef.current?.enterFullscreen(); } catch {} }} style={styles.iconBtn} hitSlop={8}>
                <Ionicons name="expand" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* Settings / tracks sheet */}
      <Modal visible={showSettings} transparent animationType="slide" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalWrap}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSettings(false)} />
        <View style={[styles.settingsSheet, { backgroundColor: 'rgba(9,9,14,0.98)', borderColor: t.border }]}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>Playback</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <Text style={[styles.sheetSection, { color: t.muted }]}>SPEED</Text>
            <View style={styles.optionWrap}>
              {SPEEDS.map((r) => (
                <Pressable key={r} onPress={() => setRate(r)} style={[styles.optionChip, speed === r && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                  <Text style={[styles.optionText, { color: speed === r ? t.accent : t.secondary }]}>{r}x</Text>
                </Pressable>
              ))}
            </View>
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
            {tracks.length > 0 && (
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
              </>
            )}
            {tracks.length === 0 && (
              <Text style={[styles.sheetNote, { color: t.muted }]}>Subtitles appear here when the stream ships them.</Text>
            )}
          </ScrollView>
        </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', position: 'relative' },
  videoFill: { width: '100%', height: '100%', backgroundColor: '#000' },
  playerRoot: { flex: 1, position: 'relative' },
  tapLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapZone: { flex: 1 },
  bufferOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 8 },
  seekHint: { position: 'absolute', alignSelf: 'center', top: '44%', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  seekHintText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hiccup: { position: 'absolute', bottom: 6, alignSelf: 'center', fontSize: 12, fontWeight: '700' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  topTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  topSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: 'rgba(168,85,247,0.35)' },
  hostDot: { position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4 },
  qualBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(0,0,0,0.35)', maxWidth: 76 },
  qualBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  nextChip: { position: 'absolute', right: 10, bottom: 62, backgroundColor: 'rgba(9,9,14,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: 12 },
  nextChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  nextChipBtn: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  nextChipBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  centerRow: { position: 'absolute', top: '38%', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26 },
  playBtn: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  sideBtn: { alignItems: 'center', justifyContent: 'center', width: 46, height: 46 },
  sideBtnText: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '700', marginTop: 1 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeText: { color: '#e5e7eb', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 22, justifyContent: 'center' },
  trackBuffered: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', left: 0 },
  trackPlayed: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: '#a855f7', left: 0 },
  trackThumb: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: '#fff', marginLeft: -6 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  textBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  textBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  settingsSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 18, paddingBottom: 26 },
  sheetTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  sheetSection: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 12, marginBottom: 6 },
  sheetNote: { fontSize: 11, marginTop: 10 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2 },
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
  meta: { padding: 16, gap: 4 },
  title: { fontSize: 19, fontWeight: '800' },
  sub: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  rowLabel: { width: '100%', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 },
  recTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '700' },
});
