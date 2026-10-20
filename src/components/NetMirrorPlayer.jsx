import { useEffect, useRef, useCallback, useState } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import dashjs from 'dashjs';
import { sanitizeCdnUrl } from '../services/api';

// CDN video streams DIRECT to the browser — sacdn3.watch22.shop is un-gated
// (no Referer needed, no CORS issue since media requests are no-cors).
const proxySubUrl = (url) => {
  if (!url) return url;
  // Our own same-origin endpoints already serve ready WebVTT (OpenSubtitles
  // fid downloads, converted server-side). Wrapping them in /proxy/subtitle?url=
  // double-proxies a relative URL, which fails to fetch — so pass them through.
  if (url.startsWith('/api/') || url.startsWith('/proxy/')) return url;
  return `/proxy/subtitle?url=${encodeURIComponent(url)}`;
};
const getSubType = (url) => {
  const raw = url.includes('url=') ? decodeURIComponent(url.split('url=').pop()) : url;
  return raw.includes('.srt') ? 'srt' : 'vtt';
};

// ── HLS.js / dash.js instance management ──
let hlsInstance = null;
let dashInstance = null;
let dashQualityMap = {}; // height(px) -> dash.js quality index, populated on MANIFEST_LOADED
// URL currently loaded into HLS.js / dash.js. art.option.url is '' in HLS/DASH
// mode (the media engines own video.src), so the quality menu had no way to tell
// whether a selected quality was a DIFFERENT stream URL. Track it here so the
// menu can re-attach when NetMirror returns one URL per quality (the common case).
let currentSrcUrl = '';

// Badge truth: the quality badge must show the rendition actually rendering,
// not the menu's top entry. ABR engines report it (LEVEL_SWITCHED /
// QUALITY_CHANGE_RENDERED); manual picks set it optimistically in onSelect.
function setQualBadge(text) {
  try {
    const el = document.querySelector('#nm-qual');
    if (el && text) el.textContent = text;
  } catch (_) {}
}
function hlsLevelLabel(hls, idx) {
  try {
    const h = hls && hls.levels && hls.levels[idx] && hls.levels[idx].height;
    return h ? `${h}p` : '';
  } catch (_) { return ''; }
}

// ── Codec guard: Chromium/Electron often decodes HEVC audio but NOT video ──
// (black screen + audio). Prefer AVC/H.264 unless HEVC is provably supported.
function hevcSupported() {
  try {
    if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported) {
      if (MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"')) return true;
      if (MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"')) return true;
    }
  } catch (_) {}
  try {
    const v = document.createElement('video');
    if (v.canPlayType && v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') === 'probably') return true;
  } catch (_) {}
  return false;
}
const isHevcHint = (s) => /hevc|h\.?265|hvc1|hev1|x265/i.test(String(s || ''));

// ── Theme accent (read fresh each call so theme switches apply) ──
// Player chrome is string-built inline styles + one <style> block, so we
// resolve --kz-accent to concrete values. Website (no --kz-*) falls back to
// the classic violet.
function themeAccent() {
  let hex = '#a855f7';
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--kz-accent').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) hex = v;
  } catch (_) {}
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const acc = (a) => `rgba(${r},${g},${b},${a})`;
  const mix = (c) => Math.round(c + (255 - c) * 0.35);
  const accLight = `rgb(${mix(r)},${mix(g)},${mix(b)})`; // like #c084fc vs the default violet
  return { hex, acc, accLight };
}

function attachHls(video, url, art, onReady, hevcOk = true) {
  // Clean up previous instance
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (_) {}
    hlsInstance = null;
  }

  if (Hls.isSupported()) {
    // The relay workers (cinemaos-relay.*.workers.dev) rate-limit aggressively
    // and return 429 under load. Without backoff, hls.js retries almost
    // immediately, which burns more quota and keeps the 429 going — so space the
    // retries out exponentially instead.
    const backoff = {
      maxNumRetry: 4,
      retryDelayMs: 1200,
      maxRetryDelayMs: 15000,
      backoff: 'exponential',
    };
    const hls = new Hls({
      startFragPrefetch: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      // Cap renditions to the on-screen size (most windows never need the
      // top bitrate; fetching it is what makes seeks re-buffer) and trim the
      // consumed back-buffer so decode/memory churn stays low on long views.
      backBufferLength: 30,
      capLevelToPlayerSize: true,
      manifestLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 15000,
          maxLoadTimeMs: 30000,
          timeoutRetry: { ...backoff, maxNumRetry: 2 },
          errorRetry: { ...backoff, maxNumRetry: 4 },
        },
      },
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 15000,
          maxLoadTimeMs: 60000,
          timeoutRetry: { ...backoff, maxNumRetry: 2 },
          errorRetry: { ...backoff, maxNumRetry: 4 },
        },
      },
    });
    hls.loadSource(url);
    currentSrcUrl = url;
    hls.attachMedia(video);
    const forceAvcLevel = () => {
      if (hevcOk) return;
      try {
        const levels = hls.levels || [];
        const idx = levels.findIndex((l) => /avc1/i.test(String(l.videoCodec || '')));
        if (idx >= 0 && hls.currentLevel !== idx) hls.currentLevel = idx;
        else if (idx < 0) {
          // No AVC level at all — every rendition is HEVC this browser can't
          // decode. Stop here so the caller can fall back to another source.
          hls.destroy();
          hlsInstance = null;
          art?.dispatchEvent?.(new CustomEvent('nm:hevc-only'));
        }
      } catch (_) {}
    };
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      forceAvcLevel();
      if (!hlsInstance) return; // hevc-only manifest: destroyed above
      video.play().catch(() => {});
      onReady?.();
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, () => {
      forceAvcLevel();
      if (!hlsInstance) return;
      setQualBadge(hlsLevelLabel(hls, hls.currentLevel) || 'Auto');
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        console.error('[HLS] Fatal error:', data.type, data.details);
        hls.destroy();
        hlsInstance = null;
        // Try native playback as fallback
        video.src = url;
      }
    });
    hlsInstance = hls;
    return hls;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari native HLS
    video.src = url;
    currentSrcUrl = url;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
      onReady?.();
    }, { once: true });
    return null;
  }
  return null;
}

function destroyHls() {
  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (_) {}
    hlsInstance = null;
  }
  if (dashInstance) {
    try { dashInstance.reset(); } catch (_) {}
    dashInstance = null;
  }
}

// ── DASH (dash.js) — netmirror's ungated sacdn DASH flow ──
function attachDash(video, url, onReady, onError, hevcOk = true) {
  if (dashInstance) {
    try { dashInstance.reset(); } catch (_) {}
    dashInstance = null;
  }
  const dp = dashjs.MediaPlayer().create();
  dp.updateSettings({
    streaming: {
      buffer: { fastSwitchEnabled: true },
      // Disable CMCD entirely — prevents "Failed to construct 'URL': Invalid URL"
      // errors from CmcdController when segment URLs are relative/opaque.
      cmcd: { enabled: false },
      // Correct dash.js 5.x key (lowercase 'pi' — confirmed in Capabilities.js source).
      // Stops dash.js using MediaCapabilities.decodingInfo() which blocks HEVC
      // on Windows Chrome, causing the whole AdaptationSet to be removed.
      capabilities: {
        filterUnsupportedEssentialProperties: true,
        useMediaCapabilitiesApi: false,
      },
    },
  });
  // Reject HEVC representations when this browser can't decode them —
  // otherwise dash.js plays the H.265 track as black-screen-plus-audio.
  // (The old always-true filter defeated this fallback; keep it only where
  // HEVC is provably supported.)
  try {
    dp.registerCustomCapabilitiesFilter((rep) => {
      if (hevcOk) return true;
      return !/hev|hvc1|h265/i.test(String(rep?.codecs || ''));
    });
  } catch (_) {}
  dp.on(dashjs.MediaPlayer.events.MANIFEST_LOADED, () => {
    try {
      const list = dp.getBitrateInfoList ? dp.getBitrateInfoList() : [];
      dashQualityMap = {};
      list.forEach(b => { if (b && b.height) dashQualityMap[b.height] = b.qualityIndex; });
    } catch (e) {}
    video.play().catch(() => {});
    onReady?.();
  });
  dp.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, (e) => {
    try {
      const list = dp.getBitrateInfoListFor ? dp.getBitrateInfoListFor('video') : [];
      const h = list && list[e.newQuality] && list[e.newQuality].height;
      setQualBadge(h ? `${h}p` : 'Auto');
    } catch (_) {}
  });
  dp.on(dashjs.MediaPlayer.events.ERROR, (e) => {
    console.error('[DASH] Fatal error:', e?.error?.message || e?.event?.message || 'unknown');
    onError?.('dash_manifest_failed');
  });
  dp.initialize(video, url, true);
  currentSrcUrl = url;
  dashInstance = dp;
  return dp;
}

export default function NetMirrorPlayer({
  sources = [],
  subtitles = [],
  title = 'Video',
  onReady,
  onTimeUpdate,
  onEnded,
  onError,
  hlsMode = false, // when true, use HLS.js for m3u8 streams
  dashMode = false, // when true, use dash.js for DASH manifests (ungated sacdn flow)
  onToggleFullscreen,
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const artRef = useRef(null);
  // One-time mobile gesture hint (there's no K key on a phone).
  const [showGestureHint, setShowGestureHint] = useState(() => {
    try {
      if (localStorage.getItem('nm_gesture_hint_seen')) return false;
      return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    } catch { return false; }
  });
  useEffect(() => {
    if (!showGestureHint) return;
    const t = setTimeout(() => {
      setShowGestureHint(false);
      try { localStorage.setItem('nm_gesture_hint_seen', '1'); } catch {}
    }, 7000);
    return () => clearTimeout(t);
  }, [showGestureHint]);
  const dismissGestureHint = () => {
    setShowGestureHint(false);
    try { localStorage.setItem('nm_gesture_hint_seen', '1'); } catch {}
  };
  // Active native <track> element + subtitle offset (seconds) so switching,
  // toggling and offset survive re-inits (quality/server switch).
  const activeTrackRef = useRef(null);
  const subOffsetRef = useRef(0);
  const subVisibleRef = useRef(true); // master on/off for our subtitle overlay
  const subElRef = useRef(null);
  const subStyleRef = useRef({ size: "auto", position: "auto", color: "#ffffff", bg: "transparent" });      // our #nm-subtitle element (lives inside art.container)

  // Single-loader contract: the parent shows its own "Resolving stream…"
  // overlay until onReady fires. While mediaReady is false the wrapper
  // carries .nm-preload, which hides Artplayer's built-in center spinner so
  // the user never sees two loaders stacked.
  const [mediaReady, setMediaReady] = useState(false);
  const cbReady = useRef(onReady);
  const cbTime = useRef(onTimeUpdate);
  const cbEnded = useRef(onEnded);
  const cbError = useRef(onError);
  useEffect(() => { cbReady.current = (...a) => { setMediaReady(true); onReady?.(...a); }; }, [onReady]);
  useEffect(() => { cbTime.current = onTimeUpdate; }, [onTimeUpdate]);
  useEffect(() => { cbEnded.current = onEnded; }, [onEnded]);
  useEffect(() => { cbError.current = onError; }, [onError]);

  useEffect(() => {
    // CDNs are un-gated (sacdn3.watch22.shop) — no referer spoofing needed.
  }, []);

  const seekBy = useCallback((seconds) => {
    if (!artRef.current) return;
    const art = artRef.current;
    if (seconds < 0) {
      art.currentTime = Math.max(0, art.currentTime + seconds);
      showFlash('left');
    } else {
      art.currentTime = Math.min(art.duration || 9999, art.currentTime + seconds);
      showFlash('right');
    }
  }, []);

  // Survives player re-inits (late subtitle merge, quality/server switch) so a
  // rebuild resumes instead of dumping the viewer back at 0:00.
  const resumeRef = useRef(0);

  // ── Seek flash overlay ──
  const showFlash = (side) => {
    if (!wrapperRef.current) return;
    const { acc } = themeAccent();
    const old = wrapperRef.current.querySelector('.nm-flash');
    if (old) { old.style.animation = 'none'; void old.offsetWidth; old.remove(); }
    const el = document.createElement('div');
    el.className = 'nm-flash';
    const isL = side === 'left';
    Object.assign(el.style, {
      position: 'absolute',
      [isL ? 'left' : 'right']: '15%',
      top: '50%',
      transform: 'translateY(-50%)',
      pointerEvents: 'none',
      background: acc(0.4),
      backdropFilter: 'blur(8px)',
      border: '1.5px solid ' + acc(0.6),
      borderRadius: '50%',
      width: '72px',
      height: '72px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '2px',
      animation: 'nmFlash .55s cubic-bezier(.4,0,.2,1) forwards',
      zIndex: '60',
    });
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${isL ? '<polyline points="15 18 9 12 15 6"/>' : '<polyline points="9 18 15 12 9 6"/>'}
      </svg>
      <span style="font-size:10px;font-weight:900;color:#fff;line-height:1">${isL ? '-10s' : '+10s'}</span>`;
    wrapperRef.current.appendChild(el);
    setTimeout(() => el.remove(), 650);
  };

  const initPlayer = useCallback(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMediaReady(false);
    if (!containerRef.current || sources.length === 0) return;
    if (artRef.current) { try { artRef.current.destroy(false); } catch (_) {} artRef.current = null; }

    // Theme accent: resolved per-init (and per-flash) via themeAccent() so the
    // string-built chrome follows Settings → Appearance changes.
    const { hex: ACCENT, acc, accLight } = themeAccent();

    // Touch devices get tap-to-reveal controls + a MutationObserver that mirrors
    // ArtPlayer's hover class to the top bar. On desktop (fine pointer) that
    // observer fights ArtPlayer's own hover cycle and flickers everything, so it
    // is gated behind coarsePointer (declared once here, used throughout).
    const coarsePointer = (() => {
      try { return window.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
    })();

    // For HLS streams, don't proxy through VPS — stream directly from CDN.
    // MP4 sources are also direct: un-gated CDN (sacdn3.watch22.shop).
    const hevcOk = hevcSupported();
    const isHls = sources[0]?.url?.includes('.m3u8') || hlsMode;
    const isDash = dashMode || /\.mpd([?#]|$)/.test(sources[0]?.url || '') || sources[0]?.url?.includes('getkey.php');
    let preparedSources = sources.map(s => ({ ...s, url: sanitizeCdnUrl(s.url) }));
    if (!hevcOk) {
      // Drop HEVC-labeled entries up front so the default pick is AVC/H.264.
      // (In-manifest HEVC is handled again in attachHls/attachDash below.)
      const avcOnly = preparedSources.filter((s) => !isHevcHint(s.url) && !isHevcHint(s.label) && !isHevcHint(s.quality));
      if (avcOnly.length) preparedSources = avcOnly;
    }
    const proxiedSubs = subtitles.map(s => ({ ...s, url: proxySubUrl(s.url) }));

    const seen = new Set();
    const qualityRank = (q) => {
      const s = String(q || '').toUpperCase();
      if (/^AUTO$/i.test(s)) return 100000; // "Auto" (ABR) sorts first / default
      const m = s.match(/(\d{3,4})\s*P|(4K|2160)/i);
      if (!m) return 0;
      if (m[2]) return 10000;
      const n = parseInt(m[1], 10);
      return (n || 0) + (s.includes('FHD') || s.includes('FULL') ? 200 : 0);
    };
    // Playback must use the SAME order as the menu/badge. NetMirror returns
    // sources ascending (360P first), so the old code played preparedSources[0]
    // (360P) while the badge/menu default showed the sorted top (1080P) — the
    // "label says 1080p but it plays 480p" bug. Sort desc so index 0 IS the top.
    preparedSources = [...preparedSources].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    const qualityCounts = {};
    preparedSources.forEach(s => { qualityCounts[s.quality] = (qualityCounts[s.quality] || 0) + 1; });
    const shortServer = (label) => String(label || '')
      .replace(/[-–]\s*\d{3,4}\s*p/gi, '')
      .replace(/\s*-\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const qualityList = preparedSources
      .filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; })
      .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality))
      .map((s, i) => {
        // Same resolution from multiple bridge servers: disambiguate so the
        // menu doesn't show N identical rows (broken highlight/selection).
        const dup = (qualityCounts[s.quality] || 0) > 1;
        const suffix = dup && s.label ? ' · ' + shortServer(s.label) : '';
        return { default: i === 0, html: (s.quality || `Source ${i + 1}`) + suffix, url: s.url };
      });

    // HLS/DASH attach the top URL but ABR starts wherever the estimator lands
    // (often 480p) — so the menu default and badge must read Auto until the
    // engine reports the real rendition (see the level listeners above). MP4
    // files play the top entry directly, so they keep it as default.
    const autoMode = (isHls || isDash) && qualityList.length > 0;
    if (autoMode && !qualityList.some((q) => /^auto$/i.test(q.html))) {
      qualityList.forEach((q) => { q.default = false; });
      qualityList.unshift({ default: true, html: 'Auto', url: null });
    }

    // ── Direct In-Memory Subtitle Engine (bypasses browser <track> CORS restrictions) ──
    const cuesRef = { current: [] };
    let subLoadSeq = 0;

    const parseVttOrSrt = (text) => {
      if (!text) return [];
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const cues = [];
      let i = 0;
      
      const parseTime = (tStr) => {
        if (!tStr) return 0;
        const parts = tStr.trim().replace(',', '.').split(':');
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
          return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(tStr) || 0;
      };

      const timeRe = /((?:\d+:)?\d+:\d+(?:[.,]\d+)?)\s*-->\s*((?:\d+:)?\d+:\d+(?:[.,]\d+)?)/;

      // WebVTT header offset used by MPEG-TS segments (HLS subs): cues are in
      // segment-local time, MPEGTS is the stream PTS at 90 kHz.
      let tsOffset = 0;
      const mapM = text.match(/X-TIMESTAMP-MAP\s*=\s*LOCAL:\s*([\d:.]+)\s*,\s*MPEGTS:\s*(\d+)/i);
      if (mapM) tsOffset = Number(mapM[2]) / 90000 - parseTime(mapM[1]);

      while (i < lines.length) {
        const line = lines[i].trim();
        const m = line.match(timeRe);
        if (m) {
          const start = parseTime(m[1]) + tsOffset;
          const end = parseTime(m[2]) + tsOffset;
          i++;
          const textLines = [];
          while (i < lines.length && lines[i].trim() !== '') {
            // Strip HTML tags AND ASS/SSA override blocks ({\an8}, {\pos..}) that
            // OpenSubtitles .srt files carry — otherwise they show as literal junk.
            textLines.push(lines[i].trim().replace(/\{[^}]*\}/g, '').replace(/<[^>]+>/g, '').trim());
            i++;
          }
          if (textLines.length > 0) {
            cues.push({ start, end, text: textLines.join('<br/>') });
          }
        } else {
          i++;
        }
      }
      return cues;
    };

    const applySubStyles = () => {
      const st = subStyleRef.current;
      const el = subElRef.current;
      if (el) {
        el.style.bottom = st.position;
      }
      const root = wrapperRef.current;
      if (root) {
        // 'auto' → clear the var so the CSS clamp() fallback applies (setting
        // font-size:auto is invalid and would shrink text to inherited size).
        if (st.size && st.size !== 'auto') root.style.setProperty('--nm-sub-size', st.size);
        else root.style.removeProperty('--nm-sub-size');
        if (st.position && st.position !== 'auto') root.style.setProperty('--nm-sub-bottom', st.position);
        else root.style.removeProperty('--nm-sub-bottom');
        root.style.setProperty('--nm-sub-color', st.color);
        root.style.setProperty('--nm-sub-bg', st.bg);
      }
      renderCues();
    };

    const renderCues = () => {
      const el = subElRef.current;
      if (!el) return;
      if (!subVisibleRef.current || !cuesRef.current || cuesRef.current.length === 0) {
        if (el.style.display !== 'none') el.style.display = 'none';
        renderCues._key = '';
        return;
      }
      const t = (artRef.current?.currentTime || 0) - subOffsetRef.current;
      const active = cuesRef.current.filter(c => t >= c.start && t <= c.end);
      if (active.length === 0) {
        if (el.style.display !== 'none') el.style.display = 'none';
        renderCues._key = '';
        return;
      }
      const st = subStyleRef.current;
      if (st.position && st.position !== 'auto') {
        el.style.bottom = st.position;
      } else {
        el.style.bottom = ''; // handled by CSS class with responsive clamp & anti-collision lift
      }

      const sizeInline = (st.size && st.size !== 'auto') ? ('font-size: ' + st.size + ' !important; ') : '';
      const bgCss = st.bg === 'transparent'
        ? 'background: transparent !important; border-radius: 4px;'
        : 'background: ' + st.bg + ' !important; backdrop-filter: blur(4px); border-radius: 6px !important; padding: 4px 12px !important;';

      // Dark subtitle colours need a light outline or they vanish on dark scenes.
      const hexM = /^#([0-9a-f]{6})$/i.exec(st.color || '');
      let darkText = false;
      if (hexM) {
        const n = parseInt(hexM[1], 16);
        darkText = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.42;
      }
      const edge = darkText ? '#fff' : '#000';
      const shadowCss = st.bg === 'transparent'
        ? 'text-shadow: -1.5px -1.5px 0 ' + edge + ', 1.5px -1.5px 0 ' + edge + ', -1.5px 1.5px 0 ' + edge + ', 1.5px 1.5px 0 ' + edge + ', 0 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8) !important;'
        : 'text-shadow: 0 2px 8px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,1) !important;';

      const html = active.map(c => '<span class="nm-sub-line" style="' + sizeInline + 'color: ' + st.color + ' !important; ' + bgCss + ' ' + shadowCss + '">' + c.text + '</span>').join('<br/>');
      // Skip DOM writes when the visible cue hasn't changed — rewriting
      // innerHTML on every timeupdate caused constant repaint churn.
      const key = html + '|' + sizeInline + st.color + st.bg;
      if (renderCues._key === key) return;
      renderCues._key = key;
      el.innerHTML = html;
      el.style.display = 'block';
    };

    const loadSubtitleTrack = async (url) => {
      const seq = ++subLoadSeq;
      if (!url) {
        cuesRef.current = [];
        renderCues();
        return;
      }
      // OpenSubtitles (fid) tracks resolve via a server-side POST /download that
      // can be slow or momentarily 502 on the first hit — retry a couple times
      // with backoff so a cold download doesn't silently leave the track blank.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(url);
          if (seq !== subLoadSeq) return; // a newer track was selected meanwhile
          if (res.ok) {
            const body = await res.text();
            if (seq !== subLoadSeq) return;
            const cues = parseVttOrSrt(body);
            if (cues.length > 0) {
              cuesRef.current = cues;
              renderCues();
              return;
            }
          }
        } catch (err) {
          console.warn('[NetMirrorPlayer] Subtitle fetch failed (attempt ' + (attempt + 1) + '):', err);
        }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      console.warn('[NetMirrorPlayer] Subtitle track failed after retries:', url);
    };

    const setSubtitleVisible = (visible) => {
      subVisibleRef.current = !!visible;
      const el = subElRef.current;
      if (!visible && el) el.style.display = 'none';
      if (visible) renderCues();
    };

    // ── Settings Panels ──
    const settingsArr = [];

    if (proxiedSubs.length > 0) {
      // A late subtitle-list merge re-inits this player; keep the viewer's
      // chosen track instead of snapping back to the first language.
      const keepUrl = activeTrackRef.current;
      settingsArr.push({
        width: 190, html: 'Subtitle Track', tooltip: proxiedSubs[0]?.label || 'English',
        selector: [
          { html: 'Off', url: '', default: keepUrl === '' },
          ...proxiedSubs.map((s, i) => ({ default: keepUrl ? s.url === keepUrl : (keepUrl === null && i === 0), html: s.label || ('Track ' + (i + 1)), url: s.url })),
        ],
        onSelect(item) {
          activeTrackRef.current = item.url || '';
          if (!item.url) {
            setSubtitleVisible(false);
            const el = wrapperRef.current?.querySelector('#nm-cc');
            if (el) {
              el.style.background = 'rgba(255,255,255,.08)';
              el.style.borderColor = 'rgba(255,255,255,.18)';
              el.style.color = 'rgba(255,255,255,.8)';
            }
            return 'Off';
          }
          setSubtitleVisible(true);
          loadSubtitleTrack(item.url);
          const el = wrapperRef.current?.querySelector('#nm-cc');
          if (el) {
            el.style.background = acc(0.35);
            el.style.borderColor = acc(0.6);
            el.style.color = accLight;
          }
          return item.html;
        },
      });

      // 🎨 Subtitle Appearance (Compact)
      settingsArr.push({
        width: 190, html: 'Subtitle Color', tooltip: 'Crisp White',
        selector: [
          { default: true, html: '⚪ Crisp White', value: '#ffffff' },
          { html: '🖤 Ink Black', value: '#000000' },
          { html: '🌑 Charcoal', value: '#374151' },
          { html: '🩶 Soft Grey', value: '#9ca3af' },
          { html: '🟡 Anime Yellow', value: '#fde047' },
          { html: '🔵 Soft Cyan', value: '#22d3ee' },
          { html: '🟢 Mint Green', value: '#4ade80' },
          { html: '🟠 Tangerine', value: '#fb923c' },
          { html: '🩷 Rose', value: '#fb7185' },
          { html: '🟣 Violet', value: '#c084fc' },
        ],
      onSelect(item) {
        subStyleRef.current.color = item.value;
        applySubStyles();
        return item.html;
      },
      });

      // 🔠 Subtitle Size presets (was never rendered — the nm-rng-size slider
      // had a handler but no UI). Selector presets are reliable on mobile too.
      settingsArr.push({
        width: 190, html: 'Subtitle Size', tooltip: 'Default',
        selector: [
          { html: 'Small', value: 'clamp(11px, 1.8vw, 16px)' },
          { default: true, html: 'Default', value: 'auto' },
          { html: 'Large', value: 'clamp(18px, 3vw, 28px)' },
          { html: 'Huge', value: 'clamp(22px, 4vw, 38px)' },
        ],
        onSelect(item) {
          subStyleRef.current.size = item.value;
          applySubStyles();
          return item.html;
        },
      });

      // ↕️ Subtitle Position presets (distance from the bottom edge).
      settingsArr.push({
        width: 190, html: 'Subtitle Position', tooltip: 'Default',
        selector: [
          { default: true, html: 'Default', value: 'auto' },
          { html: 'Lower', value: '8px' },
          { html: 'Raised', value: '80px' },
          { html: 'High', value: '140px' },
          { html: 'Very High', value: '200px' },
        ],
        onSelect(item) {
          subStyleRef.current.position = item.value;
          applySubStyles();
          return item.html;
        },
      });

      // 🎚️ Subtitle Audio Sync Quick Presets
      settingsArr.push({
        width: 190, html: 'Subtitle Sync', tooltip: '0.0s (Normal)',
        selector: [
          { html: '-5.0s (Early)', val: -5.0 },
          { html: '-2.0s (Early)', val: -2.0 },
          { html: '-1.0s (Early)', val: -1.0 },
          { html: '-0.5s (Early)', val: -0.5 },
          { default: true, html: '0.0s (Sync)', val: 0.0 },
          { html: '+0.5s (Delay)', val: 0.5 },
          { html: '+1.0s (Delay)', val: 1.0 },
          { html: '+2.0s (Delay)', val: 2.0 },
          { html: '+5.0s (Delay)', val: 5.0 },
        ],
        onSelect(item) {
          subOffsetRef.current = item.val;
          return item.html;
        },
      });
    } else {
      settingsArr.push({
        width: 180, html: 'Subtitle', tooltip: 'None Available',
        selector: [{ default: true, html: 'None Available' }],
      });
    }

    if (qualityList.length > 0) {
      settingsArr.push({
        width: 180,
        html: 'Quality',
        tooltip: autoMode ? 'Auto' : (qualityList[0]?.html || 'Auto'),
        selector: qualityList,
        onSelect(item) {
          const label = item.html;
          const b = wrapperRef.current?.querySelector('#nm-qual');
          if (b) b.textContent = label;

          // ── DASH Mode: In-memory bitrate switch (NEVER reload MPD) ──
          // Every DASH quality points at the SAME manifest.mpd (the &q= param is
          // a client-only hint the backend ignores), so switching is a dash.js
          // bitrate pin — re-attaching would needlessly reload the whole MPD.
          if (isDash) {
            if (dashInstance) {
              if (/^auto$/i.test(label)) {
                try {
                  dashInstance.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
                  dashInstance.setAutoSwitchQualityFor?.('video', true);
                } catch (_) {}
                return 'Auto';
              }
              const h = parseInt(String(label).replace(/[^0-9]/g, ''), 10);
              const bitrates = dashInstance.getBitrateInfoListFor ? dashInstance.getBitrateInfoListFor('video') : (dashInstance.getBitrateInfoList ? dashInstance.getBitrateInfoList() : []);
              let idx = !isNaN(h) ? dashQualityMap[h] : undefined;
              if (idx == null && bitrates && bitrates.length > 0) {
                const match = bitrates.reduce((prev, curr) => Math.abs((curr.height || 0) - h) < Math.abs((prev.height || 0) - h) ? curr : prev, bitrates[0]);
                idx = match?.qualityIndex;
              }
              if (idx != null) {
                try {
                  dashInstance.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
                  dashInstance.setAutoSwitchQualityFor?.('video', false);
                  dashInstance.setQualityFor('video', idx);
                } catch (e) {}
              } else {
                // Height not in quality map — re-enable ABR instead of reloading MPD
                try {
                  dashInstance.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
                  dashInstance.setAutoSwitchQualityFor?.('video', true);
                } catch (e) {}
              }
            }
            return label; // ALWAYS return for DASH — never fall through to art.switchUrl!
          }

          // ── HLS Mode ──
          // NetMirror returns ONE relay URL PER QUALITY (not an ABR ladder in a
          // single manifest), so the in-memory `currentLevel` switch found no
          // matching level and did nothing — this is the "quality change has no
          // effect" bug. When the picked quality is a different manifest URL,
          // re-attach HLS.js at it and restore position; only fall back to level
          // switching when the URL is unchanged (a true multi-level manifest).
          if (isHls) {
            if (item.url && item.url !== currentSrcUrl) {
              const t = art.currentTime;
              const wasPaused = art.video?.paused;
              attachHls(art.video, item.url, art, () => {
                try { art.currentTime = t; if (!wasPaused) art.video.play().catch(() => {}); } catch (_) {}
              }, hevcOk);
              return label;
            }
            if (hlsInstance) {
              if (/^auto$/i.test(label)) {
                hlsInstance.currentLevel = -1;
                return 'Auto';
              }
              const h = parseInt(String(label).replace(/[^0-9]/g, ''), 10);
              if (hlsInstance.levels && hlsInstance.levels.length > 0) {
                const matchIdx = hlsInstance.levels.findIndex(l => l.height === h);
                if (matchIdx !== -1) hlsInstance.currentLevel = matchIdx;
              }
            }
            return label;
          }

          // ── Direct MP4 Only ──
          if (item.url && !item.url.includes('.mpd') && !item.url.includes('.m3u8')) {
            const t = art.currentTime;
            art.switchUrl(item.url);
            currentSrcUrl = item.url;
            art.once('video:loadedmetadata', () => { art.currentTime = t; });
          }
          return label;
        },
      });
    }

    settingsArr.push({
      width: 200, html: 'Speed', tooltip: 'Normal',
      selector: [
        { html: '0.5x', value: 0.5 }, { html: '0.75x', value: 0.75 },
        { default: true, html: 'Normal', value: 1 },
        { html: '1.25x', value: 1.25 }, { html: '1.5x', value: 1.5 }, { html: '2x', value: 2 },
      ],
      onSelect(item) { art.playbackRate = item.value; return item.html; },
    });

    settingsArr.push({
      width: 200, html: 'Aspect Ratio', tooltip: 'Default',
      selector: [
        { default: true, html: 'Default', value: 'default' },
        { html: 'Fill', value: 'fill' },
        { html: '4:3', value: '4:3' },
        { html: '16:9', value: '16:9' },
      ],
      onSelect(item) {
        if (item.value === 'default') art.video.style.objectFit = 'contain';
        else if (item.value === 'fill') art.video.style.objectFit = 'fill';
        else art.aspectRatio = item.value;
        return item.html;
      },
    });

    const customControls = [];

    // ── Subtitle colour wheel: 24 hues outer ring, 8 greys inner ring ──
    // Desktop mirrors the mobile picker (hue + tone) instead of 4 presets.
    const hslToHex = (h, s, l) => {
      s /= 100; l /= 100;
      const k = (n) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
    };
    const WHEEL_HUES = Array.from({ length: 24 }, (_, i) => hslToHex(i * 15, 85, 55));
    const WHEEL_TONES = ['#000000', '#1a1a1a', '#333333', '#4d4d4d', '#808080', '#b3b3b3', '#e5e5e5', '#ffffff'];

    const toggleColorWheel = () => {
      const root = containerRef.current;
      if (!root) return;
      const open = root.querySelector('.nm-wheel-pop');
      if (open) { open.remove(); return; }
      const pop = document.createElement('div');
      pop.className = 'nm-wheel-pop';
      pop.innerHTML = `
        <div class="nm-wheel-head">
          <span>Subtitle colour</span>
          <span class="nm-wheel-preview" style="background:${subStyleRef.current.color}"></span>
        </div>
        <div class="nm-wheel"></div>
        <div class="nm-wheel-foot"><span class="nm-wheel-hex">${subStyleRef.current.color}</span><span class="nm-wheel-hint">hue · tone</span></div>`;
      root.appendChild(pop);
      const wheel = pop.querySelector('.nm-wheel');
      const preview = pop.querySelector('.nm-wheel-preview');
      const hexLabel = pop.querySelector('.nm-wheel-hex');
      const pick = (color) => {
        subStyleRef.current.color = color;
        applySubStyles();
        preview.style.background = color;
        hexLabel.textContent = color;
        wheel.querySelectorAll('.nm-dot').forEach((d) => d.classList.toggle('on', d.dataset.color === color));
      };
      const ring = (colors, radius, size) => {
        colors.forEach((c, i) => {
          const a = (i / colors.length) * Math.PI * 2 - Math.PI / 2;
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'nm-dot' + (subStyleRef.current.color === c ? ' on' : '');
          dot.dataset.color = c;
          dot.title = c;
          dot.style.cssText = `width:${size}px;height:${size}px;background:${c};left:${104 + Math.cos(a) * radius - size / 2}px;top:${104 + Math.sin(a) * radius - size / 2}px`;
          dot.addEventListener('click', (e) => { e.stopPropagation(); pick(c); });
          wheel.appendChild(dot);
        });
      };
      ring(WHEEL_HUES, 84, 15);
      ring(WHEEL_TONES, 46, 13);
      wheel.addEventListener('click', (e) => e.stopPropagation());
      setTimeout(() => {
        const close = (e) => {
          if (!pop.isConnected) { document.removeEventListener('mousedown', close); return; }
          if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', close); }
        };
        document.addEventListener('mousedown', close);
      }, 0);
    };

    customControls.push({
      name: 'subtitle-color-wheel', position: 'right', index: 12,
      html: `<div id="nm-wheel-btn" title="Subtitle colour wheel" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:30px;height:30px;border-radius:50%;cursor:pointer;
        color:rgba(255,255,255,.85);transition:all .18s ease;margin:0 2px">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6"></path>
        </svg>
      </div>`,
      tooltip: 'Subtitle Colour',
      click() { toggleColorWheel(); },
    });

        // ── Rewind 10s (Left Side) ──
    customControls.push({
      name: 'rewind-10',
      position: 'left',
      index: 10,
      html: `<div title="Rewind 10s" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:30px;height:30px;border-radius:50%;
        color:rgba(255,255,255,.85);cursor:pointer;
        transition:all .18s ease;margin:0 2px"
        onmouseover="this.style.color='${accLight}';this.style.background='${acc(0.2)}'"
        onmouseout="this.style.color='rgba(255,255,255,.85)';this.style.background='transparent'"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          <text x="12" y="14.8" font-size="7" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none" font-family="system-ui, sans-serif">10</text>
        </svg>
      </div>`,
      tooltip: 'Rewind 10s',
      click() { seekBy(-10); },
    });

    // ── Forward 10s (Left Side) ──
    customControls.push({
      name: 'forward-10',
      position: 'left',
      index: 11,
      html: `<div title="Forward 10s" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:30px;height:30px;border-radius:50%;
        color:rgba(255,255,255,.85);cursor:pointer;
        transition:all .18s ease;margin:0 2px"
        onmouseover="this.style.color='${accLight}';this.style.background='${acc(0.2)}'"
        onmouseout="this.style.color='rgba(255,255,255,.85)';this.style.background='transparent'"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          <text x="12" y="14.8" font-size="7" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none" font-family="system-ui, sans-serif">10</text>
        </svg>
      </div>`,
      tooltip: 'Forward 10s',
      click() { seekBy(10); },
    });

    // ── Subtitles CC Badge (Right Side — always present) ──
    customControls.push({
      name: 'subtitle-toggle', position: 'right', index: 10,
      html: `<div id="nm-cc" style="
        display:flex;align-items:center;justify-content:center;
        padding:3px 8px;border-radius:6px;
      background:${proxiedSubs.length > 0 ? acc(0.35) : 'rgba(255,255,255,.08)'};
      border:1.5px solid ${proxiedSubs.length > 0 ? acc(0.6) : 'rgba(255,255,255,.18)'};
        font-size:11px;font-weight:900;
        color:${proxiedSubs.length > 0 ? accLight : 'rgba(255,255,255,.5)'};
        letter-spacing:.04em;transition:all .18s;cursor:pointer">CC</div>`,
      tooltip: proxiedSubs.length > 0 ? 'Toggle Subtitles' : 'Subtitles (None Available)',
      click() {
        if (proxiedSubs.length === 0) {
          art.setting.show = true;
          return;
        }
        const next = !subVisibleRef.current;
        setSubtitleVisible(next);
        const el = wrapperRef.current?.querySelector('#nm-cc');
        if (el) {
          el.style.background = next ? acc(0.35) : 'rgba(255,255,255,.08)';
          el.style.borderColor = next ? acc(0.6) : 'rgba(255,255,255,.18)';
          el.style.color = next ? accLight : 'rgba(255,255,255,.8)';
        }
      },
    });

    // ── Quality Badge (Right Side) ──
    customControls.push({
      name: 'quality-badge', position: 'right', index: 11,
      html: `<div id="nm-qual" style="
        display:flex;align-items:center;justify-content:center;
        padding:3px 8px;border-radius:6px;
        background:${acc(0.2)};border:1.5px solid ${acc(0.5)};
        font-size:11px;font-weight:900;color:${accLight};
        letter-spacing:.04em;cursor:pointer;transition:all .18s">
        ${autoMode ? 'Auto' : (qualityList[0]?.html || 'Auto')}
      </div>`,
      tooltip: 'Switch Quality',
      click() { art.setting.show = !art.setting.show; },
    });

    // ── Volume control (touch-friendly slider + mute) ──
    // ArtPlayer's native volume panel is hover-only (useless on touch), so we
    // ship our own horizontal range slider which drags fine on mobile.
    customControls.push({
      name: 'volume-ctrl', position: 'right', index: 9,
      html: `<div id="nm-volwrap" class="nm-vol-collapsed">
        <button id="nm-mute" type="button" title="Volume / Mute" class="nm-mute-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
        </button>
        <input id="nm-vol" class="nm-vol-slider" type="range" min="0" max="1" step="0.01" value="0.85" aria-label="Volume Slider" />
      </div>`,
    });

        // ── Fullscreen (Whole Container + Rotation) ──
    customControls.push({
      name: 'fullscreen-btn',
      position: 'right',
      index: 15,
      html: `<div title="Fullscreen (F)" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:28px;height:28px;border-radius:6px;
        color:rgba(255,255,255,.9);cursor:pointer;
        transition:all .18s ease;margin:0 1px"
        onmouseover="this.style.color='${accLight}';this.style.background='${acc(0.2)}'"
        onmouseout="this.style.color='rgba(255,255,255,.9)';this.style.background='transparent'"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      </div>`,
      tooltip: 'Fullscreen',
      click() {
        if (onToggleFullscreen) {
          onToggleFullscreen();
        } else {
          const parent = containerRef.current?.closest('.nm-player-safe') || containerRef.current;
          if (!document.fullscreenElement) {
            parent?.requestFullscreen?.();
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(() => {});
            }
          } else {
            document.exitFullscreen?.();
            if (screen.orientation && screen.orientation.unlock) {
              screen.orientation.unlock();
            }
          }
        }
      },
    });

    const art = new Artplayer({
      container: containerRef.current,
      // For HLS/DASH modes, don't set a URL — HLS.js/dash.js will control the video element
      url: (isHls || isDash) ? '' : preparedSources[0].url,
      title,
      autoplay: true,
      pip: true,
      autoSize: false,
      autoMini: false,
      fullscreen: false,
      fullscreenWeb: false,
      setting: true,
      miniProgressBar: true,
      mutex: true,
      theme: 'var(--kz-accent, #a855f7)',
      volume: 0.85,
      hotkey: false,
      moreVideoAttr: {
        preload: 'auto',
        playsInline: true,
        'webkit-playsinline': 'true',
        'x5-playsinline': 'true',
        'x5-video-player-type': 'h5',
      },
      subtitleOffset: false, // we manage offset on the native <track> cues ourselves
      settings: settingsArr,
      controls: customControls,
    });

    artRef.current = art;

    art.on('video:timeupdate', () => { resumeRef.current = art.currentTime || 0; });
    art.on('ready', () => {
      const t = resumeRef.current;
      if (t > 1 && Number.isFinite(t)) {
        try { art.currentTime = t; } catch (_) {}
      }
    });
    if (activeTrackRef.current && proxiedSubs.some((s) => s.url === activeTrackRef.current)) {
      loadSubtitleTrack(activeTrackRef.current);
    }

    // ── ⏱️ Side-by-Side Progress Bar + Duration Row (Exact Match to Showcase) ──
    let isDraggingProgress = false;
    const setupSideBySideTime = () => {
      const bottom = art.template?.$bottom || wrapperRef.current?.querySelector('.art-bottom');
      const progress = art.template?.$progress || bottom?.querySelector('.art-progress');
      const timeEl = art.template?.$controls?.querySelector('.art-control-time') || bottom?.querySelector('.art-control-time');
      if (progress && timeEl && bottom) {
        let seekRow = bottom.querySelector('.nm-seek-row');
        if (!seekRow) {
          seekRow = document.createElement('div');
          seekRow.className = 'nm-seek-row';
          progress.parentNode.insertBefore(seekRow, progress);
          seekRow.appendChild(progress);
          seekRow.appendChild(timeEl);
        }
      }
    };

    art.on('show', setupSideBySideTime);

    art.on('ready', setupSideBySideTime);
    setTimeout(setupSideBySideTime, 50);
    setTimeout(setupSideBySideTime, 300);

    // ── 🛡️ Eliminate Seek Drag Snapback Glitch ──
    const progressEl = art.template?.$progress;
    if (progressEl) {
      progressEl.addEventListener('mousedown', () => { isDraggingProgress = true; }, true);
      progressEl.addEventListener('touchstart', () => { isDraggingProgress = true; }, { passive: true, capture: true });
    }
    const onEndDrag = () => {
      if (isDraggingProgress) {
        setTimeout(() => { isDraggingProgress = false; }, 150);
      }
    };
    window.addEventListener('mouseup', onEndDrag, true);
    window.addEventListener('touchend', onEndDrag, true);

    art.on('video:seeking', () => { isDraggingProgress = true; });
    art.on('video:seeked', () => { setTimeout(() => { isDraggingProgress = false; }, 100); });


    // ── Universal Event Delegation for Subtitle Sliders (Works dynamically in any setting subpanel) ──
    const onGlobalSliderInput = (e) => {
      const target = e.target;
      if (!target) return;
      if (target.id === 'nm-rng-size') {
        e.stopPropagation();
        const val = target.value + 'px';
        subStyleRef.current.size = val;
        const lbl = document.getElementById('nm-lbl-size');
        if (lbl) lbl.textContent = val;
        applySubStyles();
      } else if (target.id === 'nm-rng-pos') {
        e.stopPropagation();
        const val = target.value + 'px';
        subStyleRef.current.position = val;
        const lbl = document.getElementById('nm-lbl-pos');
        if (lbl) lbl.textContent = val;
        applySubStyles();
      } else if (target.id === 'nm-rng-bg') {
        e.stopPropagation();
        const pct = parseInt(target.value, 10);
        const lbl = document.getElementById('nm-lbl-bg');
        if (pct === 0) {
          subStyleRef.current.bg = 'transparent';
          if (lbl) lbl.textContent = '0% (Transparent)';
        } else {
          const alpha = (pct / 100).toFixed(2);
          subStyleRef.current.bg = 'rgba(0, 0, 0, ' + alpha + ')';
          if (lbl) lbl.textContent = pct + '% Solid';
        }
        applySubStyles();
      } else if (target.id === 'nm-rng-sync') {
        e.stopPropagation();
        const val = parseFloat(target.value) || 0;
        subOffsetRef.current = val;
        const lbl = document.getElementById('nm-lbl-sync');
        if (lbl) lbl.textContent = val.toFixed(1) + 's';
        renderCues();
      }
    };
    document.addEventListener('input', onGlobalSliderInput);


    // Subtitle overlay must live INSIDE the ArtPlayer element so it remains
    // visible when ArtPlayer enters fullscreen (fullscreen scopes to .art-video-player).
    const subEl = document.createElement('div');
    subEl.id = 'nm-subtitle';
    subEl.className = 'nm-subtitle-display';
    const parent = art.template?.$player || art.container || containerRef.current;
    if (parent) {
      parent.appendChild(subEl);
    }
    subElRef.current = subEl;

    // ── Wire custom interactive volume bar (tap to open, tap again to mute, tap outside to close) ──
    setTimeout(() => {
      const volWrap = wrapperRef.current?.querySelector('#nm-volwrap');
      const volSlider = wrapperRef.current?.querySelector('#nm-vol');
      const muteBtn = wrapperRef.current?.querySelector('#nm-mute');
      let volBarOpen = false;

      const updateVolIcon = (vol, isMuted) => {
        const iconBtn = wrapperRef.current?.querySelector('#nm-mute');
        if (!iconBtn) return;
        if (isMuted || vol === 0) {
          iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
        } else if (vol < 0.5) {
          iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        } else {
          iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
        }
      };

      const setVolBarState = (open) => {
        volBarOpen = open;
        if (volWrap) {
          if (open) {
            volWrap.classList.remove('nm-vol-collapsed');
            volWrap.classList.add('nm-vol-expanded');
          } else {
            volWrap.classList.add('nm-vol-collapsed');
            volWrap.classList.remove('nm-vol-expanded');
          }
        }
      };

      if (volSlider) {
        volSlider.value = String(typeof art.volume === 'number' ? art.volume : 0.85);
        volSlider.addEventListener('input', (e) => {
          e.stopPropagation();
          const v = parseFloat(volSlider.value) || 0;
          art.volume = v;
          if (art.muted && v > 0) art.muted = false;
          updateVolIcon(v, art.muted);
        });
      }

      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isMobile = window.innerWidth <= 860 || window.matchMedia('(pointer: coarse)').matches;
          if (isMobile) {
            if (!volBarOpen) {
              setVolBarState(true);
            } else {
              art.muted = !art.muted;
              updateVolIcon(art.volume, art.muted);
            }
          } else {
            art.muted = !art.muted;
            updateVolIcon(art.volume, art.muted);
          }
        });
      }

      const onDocClick = (e) => {
        if (!e.target.closest('#nm-volwrap')) {
          setVolBarState(false);
        }
      };
      document.addEventListener('click', onDocClick);
      document.addEventListener('touchstart', onDocClick, { passive: true });

      art.on('video:volumechange', () => {
        if (volSlider) volSlider.value = String(art.volume);
        updateVolIcon(art.volume, art.muted);
      });
    }, 0);

    // For HLS streams, use HLS.js instead of ArtPlayer's native loading
    if (isHls && preparedSources[0]?.url) {
      // Attach HLS.js directly — it controls video.src and fires onReady via MANIFEST_PARSED
      attachHls(art.video, preparedSources[0].url, art, () => {
        cbReady.current?.();
      }, hevcOk);
    }

    // For DASH manifests (ungated sacdn flow), use dash.js — fires onReady via MANIFEST_LOADED
    if (isDash && preparedSources[0]?.url) {
      attachDash(art.video, preparedSources[0].url, () => {
        cbReady.current?.();
      }, () => {
        cbError.current?.('dash_stream_failed');
      }, hevcOk);
    }

    // Prevent any rogue crossOrigin attribute from triggering CORS blocks on CDN MP4s
    art.video.removeAttribute('crossorigin');

    art.on('ready', () => {
      // Load initial subtitle track for MP4, HLS and DASH — unless the viewer
      // already picked one (kept across re-inits) or explicitly turned subs off.
      if (proxiedSubs.length > 0 && activeTrackRef.current === null) {
        loadSubtitleTrack(proxiedSubs[0].url);
      }
      if (isHls || isDash) return;
      cbReady.current?.();
    });
    art.on('video:timeupdate', () => {
      renderCues();
      cbTime.current?.({ currentTime: art.currentTime, duration: art.duration });
    });
    if (art.video) {
      art.video.addEventListener('timeupdate', renderCues);
    }
    art.on('video:ended', () => cbEnded.current?.());

    // ── Sync top bar visibility with player controls ──
    // Bubble a class to the nm-player-safe ancestor so Player.jsx can hide/show top bar
    const syncTopBarVisibility = (visible) => {
      const parent = wrapperRef.current?.closest('.nm-player-safe');
      if (parent) {
        if (visible) parent.classList.add('nm-controls-visible');
        else parent.classList.remove('nm-controls-visible');
      }
    };
    art.on('show', () => syncTopBarVisibility(true));
    art.on('hide', () => syncTopBarVisibility(false));
    // Also MutationObserver to watch art-hover class on art root (more reliable)
    // — touch only. On desktop, class churn from ArtPlayer's own hover cycle
    // would re-toggle the top bar every few frames.
    const artRoot = art.template?.$player || containerRef.current?.querySelector('.art-video-player');
    if (artRoot && coarsePointer) {
      const mo = new MutationObserver(() => {
        syncTopBarVisibility(artRoot.classList.contains('art-hover'));
      });
      mo.observe(artRoot, { attributes: true, attributeFilter: ['class'] });
      art._topBarMO = mo;
    }

    // ── On error, fail fast — no quality fallback chain ──
    art.on('error', (err) => {
      console.error('[NetMirrorPlayer] Stream error:', err);
      if (isHls && hlsInstance) return;
      if (isDash && dashInstance) return;
      cbError.current?.('media_source_failed');
    });

    // ── HEVC watchdog ──
    // Chromium on Windows decodes H.265 ONLY via hardware + the OS "HEVC Video
    // Extension". Without it, an HEVC file plays audio with a BLACK picture
    // (videoWidth stays 0 forever) — the exact symptom users report as "black
    // screen". Detect that state and point at the AVC embed servers instead of
    // leaving a dead black box.
    const showHevcNotice = () => {
      if (wrapperRef.current?.querySelector('#nm-hevc-note')) return;
      const note = document.createElement('div');
      note.id = 'nm-hevc-note';
      note.style.cssText = 'position:absolute;inset:auto 12px 12px 12px;z-index:50;border-radius:12px;padding:12px 14px;background:rgba(10,10,15,0.92);border:1px solid rgba(248,113,113,0.35);color:#fecaca;font-size:12px;line-height:1.5;backdrop-filter:blur(8px)';
      note.innerHTML = '<b style="color:#fff">Video can\'t decode on this device.</b><br/>This file is HEVC (H.265) and your system lacks the HEVC decoder — audio plays, picture stays black. Switch to <b style="color:#fff">Server 1 / 2 / 3</b> below, or install the HEVC Video Extension from the Microsoft Store. <span id="nm-hevc-x" style="float:right;cursor:pointer;color:#fff;font-weight:700;padding:0 4px">✕</span>';
      wrapperRef.current?.appendChild(note);
      note.querySelector('#nm-hevc-x')?.addEventListener('click', () => note.remove());
    };
    let hevcChecks = 0;
    const hevcTimer = setInterval(() => {
      try {
        const v = art.video;
        if (!v) { clearInterval(hevcTimer); return; }
        // Playing (time advancing, not paused/ended) but zero decoded pixels.
        if (!v.paused && !v.ended && v.currentTime > 4 && v.videoWidth === 0 && v.readyState >= 2) {
          showHevcNotice();
          clearInterval(hevcTimer);
          return;
        }
        if (++hevcChecks >= 15) clearInterval(hevcTimer); // stop after ~30s
      } catch (_) { clearInterval(hevcTimer); }
    }, 2000);
    art._hevcTimer = hevcTimer;

    // ── Touch Gestures (Brightness Left, Volume Right, Horizontal Scrub Seek) ──
    const pContainer = art.template?.$player || art.container || containerRef.current;

    const HUD_ICONS = {
      sun: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
      volHigh: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#ffffff"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`,
      volLow: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#ffffff"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
      volMute: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#ffffff"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
      forward: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19" fill="#ffffff"></polygon><polygon points="2 19 11 12 2 5 2 19" fill="#ffffff"></polygon></svg>`,
      rewind: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 19 2 12 11 5 11 19" fill="#ffffff"></polygon><polygon points="22 19 13 12 22 5 22 19" fill="#ffffff"></polygon></svg>`,
      play: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
      pause: `<svg viewBox="0 0 24 24" width="28" height="28" fill="#ffffff" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`,
    };

    let touchState = {
      active: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      startVol: 0.85,
      startBright: 1,
      startCurTime: 0,
      mode: null,
      deltaT: 0,
      lastTapTime: 0,
      lastTapX: 0,
    };

    let curBrightness = 1;

    let hudEl = pContainer?.querySelector('#nm-gesture-hud');
    if (!hudEl && pContainer) {
      hudEl = document.createElement('div');
      hudEl.id = 'nm-gesture-hud';
      hudEl.className = 'nm-gesture-hud-container';
      pContainer.appendChild(hudEl);
    }

    let hudTimer = null;
    const showHud = (icon, text) => {
      if (!hudEl) return;
      hudEl.innerHTML = `
        <div class="nm-mx-hud-pill">
          <span class="nm-mx-hud-icon">${icon}</span>
          <span class="nm-mx-hud-text">${text}</span>
        </div>
      `;
      hudEl.style.display = 'flex';
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => {
        if (hudEl) hudEl.style.display = 'none';
      }, 750);
    };

    const formatSecs = (s) => {
      const sec = Math.max(0, Math.floor(s || 0));
      const m = Math.floor(sec / 60);
      const remS = sec % 60;
      return `${m}:${remS < 10 ? '0' : ''}${remS}`;
    };

    const onTouchStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const target = e.target;
      if (target.closest('.art-bottom') || target.closest('.art-controls') || target.closest('.art-setting')) return;

      const touch = e.touches[0];
      const rect = pContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const now = Date.now();
      if (now - touchState.lastTapTime < 280 && Math.abs(x - touchState.lastTapX) < 40) {
        if (x < rect.width * 0.4) {
          seekBy(-10);
          showHud(HUD_ICONS.rewind, '-10s');
        } else if (x > rect.width * 0.6) {
          seekBy(10);
          showHud(HUD_ICONS.forward, '+10s');
        } else {
          // Capture state BEFORE toggle — art.playing flips async, so reading
          // it after toggle shows the wrong (stale) icon.
          const willPlay = !art.playing;
          art.toggle();
          showHud(willPlay ? HUD_ICONS.pause : HUD_ICONS.play, willPlay ? 'Pause' : 'Play');
        }
        touchState.lastTapTime = 0;
        return;
      }
      touchState.lastTapTime = now;
      touchState.lastTapX = x;

      touchState.active = true;
      touchState.startX = x;
      touchState.startY = y;
      touchState.startTime = now;
      touchState.startVol = typeof art.volume === 'number' ? art.volume : 0.85;
      touchState.startBright = curBrightness;
      touchState.startCurTime = art.currentTime || 0;
      touchState.mode = null;
      touchState.deltaT = 0;
    };

    const onTouchMove = (e) => {
      if (!touchState.active || !e.touches || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = pContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const dx = x - touchState.startX;
      const dy = y - touchState.startY;

      if (!touchState.mode) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
          touchState.mode = 'seek';
        } else if (Math.abs(dy) > 12) {
          touchState.mode = touchState.startX < rect.width * 0.5 ? 'brightness' : 'volume';
        }
      }

      if (!touchState.mode) return;
      e.preventDefault();

      if (touchState.mode === 'seek') {
        const dur = art.duration || 1800;
        const seekSpan = Math.min(120, dur * 0.25);
        const delta = (dx / rect.width) * seekSpan;
        touchState.deltaT = delta;
        const targetT = Math.max(0, Math.min(dur, touchState.startCurTime + delta));
        const deltaSign = delta >= 0 ? '+' : '';
        showHud(
          delta >= 0 ? HUD_ICONS.forward : HUD_ICONS.rewind,
          `${formatSecs(targetT)} (${deltaSign}${Math.round(delta)}s)`
        );
      } else if (touchState.mode === 'volume') {
        const step = -dy / (rect.height * 0.7);
        const newVol = Math.max(0, Math.min(1, touchState.startVol + step));
        art.volume = newVol;
        if (art.muted && newVol > 0) art.muted = false;
        const volSlider = wrapperRef.current?.querySelector('#nm-vol');
        if (volSlider) volSlider.value = String(newVol);
        const pct = Math.round(newVol * 100);
        showHud(
          newVol === 0 ? HUD_ICONS.volMute : newVol < 0.5 ? HUD_ICONS.volLow : HUD_ICONS.volHigh,
          `${pct}%`
        );
      } else if (touchState.mode === 'brightness') {
        // Floor 0.45: below that the picture looks "broken black" and users
        // mistake a dimmed screen for a dead stream with no way back.
        const step = -dy / (rect.height * 0.7);
        const newBright = Math.max(0.45, Math.min(1.8, touchState.startBright + step));
        curBrightness = newBright;
        if (art.video) {
          // Via --nm-bright: the stylesheet forces `filter: var(--nm-bright)`
          // with !important, so a plain inline filter would lose.
          art.video.style.setProperty('--nm-bright', `brightness(${newBright.toFixed(2)})`);
        }
        showHud(HUD_ICONS.sun, `${Math.round(newBright * 100)}%`);
      }
    };

    const onTouchEnd = () => {
      if (!touchState.active) return;
      if (touchState.mode === 'seek' && Math.abs(touchState.deltaT) > 1) {
        const dur = art.duration || 0;
        const targetT = Math.max(0, Math.min(dur, touchState.startCurTime + touchState.deltaT));
        art.currentTime = targetT;
      }
      touchState.active = false;
      touchState.mode = null;
    };

    // ── Controls reveal (touch devices only) ──
    // Desktop uses ArtPlayer's native hover handling. Force-adding `art-hover`
    // on every pointerdown/click fights its show/hide cycle and makes the whole
    // control bar flicker — so tap-reveal exists only for coarse pointers.
    let revealTimer = null;
    const revealControls = () => {
      if (!coarsePointer) return;
      const root = art.template?.$player || wrapperRef.current?.querySelector('.art-video-player');
      if (!root) return;
      try { root.classList.add('art-hover'); } catch (_) {}
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        try { root.classList.remove('art-hover'); } catch (_) {}
        revealTimer = null;
      }, 3200);
    };

    if (pContainer && coarsePointer) {
      pContainer.addEventListener('touchstart', onTouchStart, { passive: true });
      pContainer.addEventListener('touchmove', onTouchMove, { passive: false });
      pContainer.addEventListener('touchend', onTouchEnd, { passive: true });
      pContainer.addEventListener('touchcancel', onTouchEnd, { passive: true });
      // Covers both touch and mouse — this is the bit that was missing.
      pContainer.addEventListener('pointerdown', revealControls, { passive: true });
      pContainer.addEventListener('click', revealControls, { passive: true });
    }

    // ── Middle-click toggles play/pause (and kills browser autoscroll) ──
    const onMidDown = (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onMidClick = (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.target.closest?.('.art-bottom') || e.target.closest?.('.art-controls') || e.target.closest?.('.art-setting')) return;
      const willPlay = !art.playing;
      art.toggle();
      showHud(willPlay ? HUD_ICONS.pause : HUD_ICONS.play, willPlay ? 'Pause' : 'Play');
    };
    if (pContainer) {
      // mousedown fires before autoscroll engages; auxclick is the click itself.
      pContainer.addEventListener('mousedown', onMidDown, true);
      pContainer.addEventListener('auxclick', onMidClick, true);
    }

    // ── Keyboard Shortcuts ──
    const handleKey = (e) => {
      if (!artRef.current || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); seekBy(-10); }
      if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(10); }
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); art.toggle(); }
      if (e.key === 'm') { art.muted = !art.muted; }
      if (e.key === 'f') { art.fullscreen = !art.fullscreen; }
    };

    document.addEventListener('keydown', handleKey);
    art._cleanup = () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('input', onGlobalSliderInput);
      window.removeEventListener('mouseup', onEndDrag, true);
      window.removeEventListener('touchend', onEndDrag, true);
      if (art._hevcTimer) { clearInterval(art._hevcTimer); art._hevcTimer = null; }
      try { wrapperRef.current?.querySelector('#nm-hevc-note')?.remove(); } catch (_) {}
      if (art._topBarMO) { art._topBarMO.disconnect(); art._topBarMO = null; }
      if (pContainer) {
        pContainer.removeEventListener('touchstart', onTouchStart);
        pContainer.removeEventListener('touchmove', onTouchMove);
        pContainer.removeEventListener('touchend', onTouchEnd);
        pContainer.removeEventListener('touchcancel', onTouchEnd);
        pContainer.removeEventListener('pointerdown', revealControls);
        pContainer.removeEventListener('click', revealControls);
        if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
        pContainer.removeEventListener('mousedown', onMidDown, true);
        pContainer.removeEventListener('auxclick', onMidClick, true);
      }
    };

  }, [sources, subtitles, title, seekBy]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    initPlayer();
    return () => {
      if (artRef.current) {
        try { artRef.current._cleanup?.(); artRef.current.destroy(false); } catch (_) {}
        artRef.current = null;
      }
      if (subElRef.current) { try { subElRef.current.remove(); } catch (_) {} subElRef.current = null; }
      destroyHls();
    };
  }, [initPlayer]);

  useEffect(() => () => destroyHls(), []);

  return (
    <div
      ref={wrapperRef}
      className={`w-full h-full bg-black relative group select-none overflow-hidden${mediaReady ? '' : ' nm-preload'}`}
    >
      {/* ── ArtPlayer Container ── */}
      <div ref={containerRef} className="w-full h-full" />

      {/* ── One-time mobile gesture hint (no keyboard on phones) ── */}
      {showGestureHint && (
        <button
          onClick={dismissGestureHint}
          className="absolute left-1/2 top-14 sm:top-16 -translate-x-1/2 z-40 max-w-[92%] rounded-2xl bg-zinc-950/85 backdrop-blur-md border border-white/10 px-3.5 py-2.5 text-left shadow-2xl active:scale-[0.98] transition-transform"
        >
          <div className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: 'var(--kz-accent, #c084fc)' }}>Gestures</div>
          <div className="text-[12px] leading-relaxed text-zinc-200 font-semibold">
            Double-tap center play/pause · sides ±10s · swipe sideways seek · right edge volume · left edge brightness
          </div>
        </button>
      )}

                                    <style>{`
        /* ── NetMirror Clean Theme & Layout ── */
        .art-video-player {
          font-family: inherit !important;
          background: #000 !important;
          position: relative !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          /* Swipe gestures own the touchscreen — without this the page
             scrolls mid-swipe, the browser fires touchcancel, and volume /
             brightness / scrub gestures die before the 12px threshold. */
          touch-action: none !important;
        }

        /* Video MUST NEVER be dimmed or filtered — except the gesture
           brightness variable, which the swipe handler drives. (A plain
           filter none !important here would override the inline gesture
           filter, which is why brightness swipe did nothing.) */
        .art-video-player video,
        .art-video-player .art-video {
          filter: var(--nm-bright, none) !important;
          -webkit-filter: var(--nm-bright, none) !important;
          opacity: 1 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
        }

        /* ── SINGLE LOADER: parent overlay owns the pre-ready state.
           Artplayer's own center spinner + notice stay hidden until the
           first frame is ready, so two loaders never stack. ── */
        .nm-preload .art-loading,
        .nm-preload .art-notice {
          display: none !important;
        }

        /* ── ZERO DARK MASKS OVER VIDEO ── */
        .art-video-player .art-mask,
        .art-video-player.art-setting-show .art-mask,
        .art-video-player .art-state,
        .art-video-player .art-layers {
          background: transparent !important;
          background-color: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          pointer-events: none !important;
        }
        .art-video-player .art-mask-show {
          display: none !important;
        }

        /* ── Bottom Controls Bar: strictly anchored to bottom & hides as one unit ── */
        .art-video-player .art-bottom {
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          top: auto !important;
          width: 100% !important;
          /* Content height only. Left unconstrained this stretched to the full
             player height (412x232) and, being z-index 25, covered the video. */
          height: auto !important;
          max-height: 60% !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: flex-end !important;
          gap: 3px !important;
          padding: 0 10px 8px !important;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%) !important;
          z-index: 25 !important;
          /* The bar must never eat taps meant for the video (play/pause, gestures).
             Only its interactive children opt back in — see the rule below. */
          pointer-events: none !important;
          transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1), transform 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }

        /* Interactive parts of the bar take pointer events again. */
        .art-video-player .art-bottom .nm-seek-row,
        .art-video-player .art-bottom .art-controls,
        .art-video-player .art-bottom .art-progress,
        .art-video-player .art-bottom .art-control {
          pointer-events: auto !important;
        }

        .art-video-player:not(.art-hover):not(.art-control-show) .art-bottom {
          opacity: 0 !important;
          transform: translateY(8px) !important;
        }
        .art-video-player.art-hover .art-bottom,
        .art-video-player.art-control-show .art-bottom {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        /* Hidden bar must not intercept anything. */
        .art-video-player:not(.art-hover):not(.art-control-show) .art-bottom .nm-seek-row,
        .art-video-player:not(.art-hover):not(.art-control-show) .art-bottom .art-controls,
        .art-video-player:not(.art-hover):not(.art-control-show) .art-bottom .art-progress,
        .art-video-player:not(.art-hover):not(.art-control-show) .art-bottom .art-control {
          pointer-events: none !important;
        }

        /* ── Row 1: Side-by-Side Seekbar + Duration ── */
        .nm-seek-row {
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          width: 100% !important;
        }
        .nm-seek-row .art-progress {
          flex: 1 !important;
          width: auto !important;
          margin: 0 !important;
          cursor: pointer !important;
          /* Fat touch target without visually thickening the 4px track: the
             extra padding is pulled back out of the flex layout. */
          padding-top: 11px !important;
          padding-bottom: 11px !important;
          margin-top: -7px !important;
          margin-bottom: -7px !important;
        }
        .nm-seek-row .art-control-time {
          display: inline-flex !important;
          align-items: center !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          color: rgba(255, 255, 255, 0.95) !important;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9) !important;
          padding: 0 2px !important;
          margin: 0 !important;
          white-space: nowrap !important;
          user-select: none !important;
          letter-spacing: 0.02em !important;
        }

        /* ── Row 2: Controls Buttons Row ── */
        .art-video-player .art-controls {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          width: 100% !important;
        }

        .art-video-player .art-controls-left,
        .art-video-player .art-controls-right {
          display: flex !important;
          align-items: center !important;
          gap: 4px !important;
        }

        /* ── Control tooltips (ArtPlayer hint.css: "Switch Quality", "Settings",
              "Fullscreen"…). They render as ::after on the control and were
              getting clipped by the bottom bar / player overflow and slipping
              UNDER the video. Force them above everything, keep them on one
              line, and let the control bar overflow so they can escape. ── */
        .art-video-player .art-bottom,
        .art-video-player .art-controls,
        .art-video-player .art-controls-left,
        .art-video-player .art-controls-right {
          overflow: visible !important;
        }
        .art-video-player [class*="hint--"]::after,
        .art-video-player [class*="hint--"]::before {
          z-index: 90 !important;
          white-space: nowrap !important;
          pointer-events: none !important;
        }

        /* ── Modern Compact Settings Menu (Desktop & Mobile) ── */
        .art-video-player .art-setting {
          max-width: min(220px, 80vw) !important;
          background: rgba(11, 10, 22, 0.94) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 12px !important;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.2) !important;
          color: #fff !important;
          overflow: hidden !important;
          bottom: 50px !important;
          right: 10px !important;
          z-index: 60 !important;
        }
        .art-video-player .art-setting-panel {
          max-height: min(280px, 60vh) !important;
          overflow-y: auto !important;
          padding: 4px 0 !important;
        }
        .art-video-player .art-setting-panel::-webkit-scrollbar {
          width: 4px;
        }
        .art-video-player .art-setting-panel::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .art-video-player .art-setting-item {
          height: 34px !important;
          line-height: 34px !important;
          padding: 0 12px !important;
          font-size: 11.5px !important;
          font-weight: 600 !important;
          transition: background 0.15s ease !important;
        }
        .art-video-player .art-setting-item:hover {
          background: rgba(168, 85, 247, 0.2) !important;
        }
        .art-video-player .art-setting-item-left {
          font-size: 11.5px !important;
          color: rgba(255, 255, 255, 0.9) !important;
        }
        .art-video-player .art-setting-item-right {
          font-size: 11px !important;
          color: var(--kz-accent, #c084fc) !important;
          font-weight: 700 !important;
        }
        .art-video-player .art-setting-header {
          height: 32px !important;
          line-height: 32px !important;
          padding: 0 12px !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          background: rgba(255, 255, 255, 0.03) !important;
        }

        /* ── Subtitle Sliders Styling inside Settings ── */
        .nm-sub-setting-panel {
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
          cursor: default;
        }
        .nm-sp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
          font-weight: 700;
          color: #e4e4eb;
        }
        .nm-sp-header b {
          color: var(--kz-accent, #c084fc);
          font-size: 11px;
          background: rgba(168, 85, 247, 0.15);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .nm-sp-slider {
          width: 100%;
          height: 5px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.2);
          outline: none;
          accent-color: var(--kz-accent, #a855f7);
          cursor: pointer;
        }
        .nm-sp-ticks {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #71717a;
          font-weight: 600;
        }

        /* ── Transparent White SVG Gesture HUD with smooth fade ── */
        .nm-gesture-hud-container {
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          z-index: 45 !important;
          pointer-events: none !important;
          display: none;
          align-items: center !important;
          justify-content: center !important;
          background: transparent !important;
        }
        .nm-mx-hud-pill {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          animation: nmGestureFade 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        .nm-mx-hud-icon svg {
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.9)) drop-shadow(0 0 16px rgba(0,0,0,0.8)) !important;
        }
        .nm-mx-hud-text {
          font-size: 14px !important;
          font-weight: 800 !important;
          color: #ffffff !important;
          letter-spacing: 0.02em !important;
          text-shadow: 0 2px 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.9) !important;
          white-space: nowrap !important;
        }
        @keyframes nmGestureFade {
          0% { opacity: 0; transform: scale(0.85); }
          100% { opacity: 1; transform: scale(1); }
        }

        /* ── Hide Duplicate Native Volume ── */
        .art-video-player .art-control-volume,
        .art-video-player [name="volume"],
        .art-video-player .art-control[name="volume"],
        .art-video-player .art-controls-left .art-control-volume {
          display: none !important;
          width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          pointer-events: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }

        /* ── Auto-Responsive Crisp White Subtitles (Adapts to Any Screen) ── */
        .nm-subtitle-display,
        .art-video-player .art-subtitle {
          position: absolute !important;
          bottom: var(--nm-sub-bottom, 20px) !important;
          top: auto !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 90% !important;
          max-width: 820px !important;
          text-align: center !important;
          z-index: 24 !important;
          pointer-events: none !important;
          margin: 0 !important;
          padding: 0 !important;
          transition: bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .nm-subtitle-display {
          display: none;
        }

        /* When controls are active/hovered, smoothly lift subtitles so they NEVER collide with seekbar/controls */
        .art-video-player.art-hover .art-subtitle,
        .nm-player-safe.nm-controls-visible .art-subtitle {
          bottom: calc(var(--nm-sub-bottom, 20px) + 54px) !important;
        }

        .nm-sub-line,
        .art-video-player .art-subtitle p,
        .art-video-player video::cue {
          display: inline-block !important;
          background: var(--nm-sub-bg, transparent) !important;
          border-radius: 4px !important;
          padding: 2px 8px !important;
          margin: 1px 0 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          font-size: var(--nm-sub-size, clamp(13px, 2.3vw, 21px)) !important;
          font-weight: 700 !important;
          color: var(--nm-sub-color, #ffffff) !important;
          opacity: 1 !important;
          text-shadow: 
            -1.5px -1.5px 0 #000, 
             1.5px -1.5px 0 #000, 
            -1.5px  1.5px 0 #000, 
             1.5px  1.5px 0 #000, 
             0 2px 4px rgba(0,0,0,0.9),
             0 0 8px rgba(0,0,0,0.8) !important;
          line-height: 1.35 !important;
          white-space: pre-wrap !important;
        }

        /* ── Interactive Tap-to-Expand Sound Bar ── */
        #nm-volwrap {
          display: flex !important;
          align-items: center !important;
          background: rgba(255, 255, 255, 0.08) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 20px !important;
          padding: 2px 5px !important;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        #nm-volwrap:hover, #nm-volwrap.nm-vol-expanded {
          background: rgba(168, 85, 247, 0.2) !important;
          border-color: rgba(168, 85, 247, 0.45) !important;
          box-shadow: 0 0 10px rgba(168, 85, 247, 0.25) !important;
        }
        .nm-mute-btn {
          background: transparent !important;
          border: none !important;
          color: rgba(255, 255, 255, 0.9) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 22px !important;
          height: 22px !important;
          cursor: pointer !important;
          padding: 0 !important;
          outline: none !important;
        }
        .nm-vol-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 0;
          opacity: 0;
          margin: 0;
          height: 4px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.3);
          outline: none;
          cursor: pointer;
          pointer-events: none;
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, margin 0.2s ease !important;
        }
        #nm-volwrap.nm-vol-expanded .nm-vol-slider {
          width: 50px !important;
          opacity: 1 !important;
          margin: 0 4px 0 2px !important;
          pointer-events: auto !important;
        }
        @media (min-width: 768px) {
          #nm-volwrap:hover .nm-vol-slider {
            width: 50px !important;
            opacity: 1 !important;
            margin: 0 4px 0 2px !important;
            pointer-events: auto !important;
          }
        }
        .nm-vol-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--kz-accent, #c084fc);
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.5);
          cursor: pointer;
        }
        .nm-vol-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: none;
          border-radius: 50%;
          background: var(--kz-accent, #c084fc);
          box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.5);
          cursor: pointer;
        }

        /* ── Compact Settings Panels (long subtitle/quality lists scroll) ── */
        .art-video-player .art-setting {
          max-width: min(230px, 78vw) !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9) !important;
        }
        .art-video-player .art-setting-panel {
          max-height: min(300px, 58vh) !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
          padding: 2px 0 !important;
        }
        .art-video-player .art-selector-list {
          max-height: min(260px, 52vh) !important;
          overflow-y: auto !important;
          overscroll-behavior: contain !important;
        }
        .art-video-player .art-selector-list::-webkit-scrollbar,
        .art-video-player .art-setting-panel::-webkit-scrollbar {
          width: 6px !important;
        }
        .art-video-player .art-selector-list::-webkit-scrollbar-thumb,
        .art-video-player .art-setting-panel::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.5) !important;
          border-radius: 3px !important;
        }
        .art-video-player .art-selector-item {
          padding: 5px 12px !important;
          font-size: 12.5px !important;
          line-height: 1.5 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .art-video-player .art-setting-item {
          min-height: 32px !important;
          padding: 0 12px !important;
          font-size: 12.5px !important;
        }

        /* ── Mobile Player Controls Layout ── */
        @media (max-width: 860px), (pointer: coarse) {
          .art-video-player .art-bottom {
            padding: 0 8px 8px !important;
          }
          .art-video-player .art-control-time {
            font-size: 10px !important;
            padding: 0 1px !important;
          }
          .art-video-player .art-control[name="rewind-10"],
          .art-video-player .art-control[name="forward-10"] {
            display: none !important;
          }
          .art-video-player .art-controls {
            gap: 2px !important;
          }
          .art-video-player .art-controls-left,
          .art-video-player .art-controls-right {
            gap: 2px !important;
          }
          .art-video-player .art-control {
            padding: 0 2px !important;
            margin: 0 !important;
            min-width: 22px !important;
          }
          #nm-cc {
            padding: 2px 5px !important;
            font-size: 10px !important;
          }
          #nm-qual {
            padding: 2px 5px !important;
            font-size: 9.5px !important;
          }
          .nm-sub-line,
          .art-video-player .art-subtitle p,
          .art-video-player video::cue {
            font-size: var(--nm-sub-size, clamp(11.5px, 3.2vw, 15px)) !important;
            padding: 1px 6px !important;
          }
          .art-video-player.art-hover .art-subtitle,
          .nm-player-safe.nm-controls-visible .art-subtitle {
            bottom: calc(var(--nm-sub-bottom, 16px) + 50px) !important;
          }

          /* ── Mobile Compact Settings Menu ── */
          .art-video-player .art-setting {
            max-width: min(190px, 72vw) !important;
            border-radius: 10px !important;
            bottom: 44px !important;
            right: 6px !important;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9) !important;
          }
          .art-video-player .art-setting-panel {
            max-height: min(220px, 52vh) !important;
            padding: 2px 0 !important;
          }
          .art-video-player .art-setting-item {
            height: 30px !important;
            line-height: 30px !important;
            padding: 0 10px !important;
            font-size: 10.5px !important;
          }
          .art-video-player .art-setting-item-left {
            font-size: 10.5px !important;
          }
          .art-video-player .art-setting-item-right {
            font-size: 10px !important;
          }
          .art-video-player .art-setting-header {
            height: 28px !important;
            line-height: 28px !important;
            font-size: 10.5px !important;
            padding: 0 10px !important;
          }
        }

        /* ── Subtitle colour wheel popover ── */
        .nm-wheel-pop {
          position: absolute !important;
          right: 12px !important;
          bottom: 60px !important;
          width: 228px !important;
          padding: 10px !important;
          border-radius: 14px !important;
          background: rgba(10, 10, 16, 0.96) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.7) !important;
          backdrop-filter: blur(10px) !important;
          z-index: 80 !important;
          color: rgba(255, 255, 255, 0.9) !important;
        }
        .nm-wheel-head {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          letter-spacing: 0.02em !important;
          padding: 0 2px 6px !important;
        }
        .nm-wheel-preview {
          width: 16px !important;
          height: 16px !important;
          border-radius: 50% !important;
          border: 1px solid rgba(255, 255, 255, 0.45) !important;
          display: inline-block !important;
        }
        .nm-wheel {
          position: relative !important;
          width: 208px !important;
          height: 208px !important;
        }
        .nm-dot {
          position: absolute !important;
          padding: 0 !important;
          border-radius: 50% !important;
          border: 2px solid transparent !important;
          cursor: pointer !important;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35) !important;
          transition: transform 0.12s ease !important;
        }
        .nm-dot:hover { transform: scale(1.18) !important; }
        .nm-dot.on {
          border-color: #fff !important;
          box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.65) !important;
        }
        .nm-wheel-foot {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          font-size: 10px !important;
          color: rgba(255, 255, 255, 0.55) !important;
          padding: 6px 2px 0 !important;
          font-variant-numeric: tabular-nums !important;
        }

        @media (max-width: 480px) {
          .art-video-player .art-bottom {
            padding: 0 5px 6px !important;
          }
          .art-video-player .art-control-time {
            font-size: 9.5px !important;
            padding: 0 1px !important;
          }
        }`}</style>
    </div>
  );
}
