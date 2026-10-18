/**
 * VegaMovies / Gemma stream resolver — CLIENT-SIDE
 *
 * Called AFTER the server returns playlist reference from /api/netmirror/sources?provider=vega
 * The server handles Steps 1-2 (gemma config + playlist fetch).
 * This module handles Step 3 (IP-bound HLS resolution) — MUST run in user's browser.
 *
 * Flow:
 *   Server: TMDB → IMDB → gemma config → playlist tracks → returns reference
 *   Client: reference → HLS URL (IP-bound) → HLS.js playback
 */

const PLAYLIST_HOST = 'https://jenks426set.com';

// Ad domains to block
const AD_DOMAINS = [
  'agl002.online', 'seenproof.com', 'doubleclick.net',
  'googlesyndication.com', 'googleadservices.com',
  'ads.', 'analytics.', 'tracking.',
];

function isAdFree(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return !AD_DOMAINS.some(d => lower.includes(d));
}

/**
 * Resolve the actual HLS stream URL from a playlist reference.
 * This MUST run client-side because the URL is IP-bound to the requesting browser.
 *
 * @param {object} ref - Playlist reference from server
 * @param {string} ref.playlistUrl - The gemma playlist URL
 * @param {string} ref.csrfKey - CSRF token for POST requests
 * @param {string} ref.trackFile - Encoded file field from the language track (starts with ~)
 * @returns {Promise<string>} - HLS stream URL
 */
export async function resolveHlsFromReference({ playlistUrl, csrfKey, trackFile }) {
  if (!playlistUrl || !csrfKey || !trackFile) {
    throw new Error('Missing playlist reference data');
  }

  // Remove the ~ prefix to get the encoded part
  const encoded = trackFile.startsWith('~') ? trackFile.substring(1) : trackFile;

  // Build the sub-playlist URL
  const subUrl = `${playlistUrl.replace(/\/playlist\/.*/, '/playlist/')}${encoded}.txt`;

  const res = await fetch(subUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': csrfKey,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`Sub-playlist returned ${res.status}`);
  const streamUrl = (await res.text()).trim();

  if (!streamUrl.startsWith('http')) {
    throw new Error(`Invalid stream URL: ${streamUrl.substring(0, 50)}`);
  }

  if (!isAdFree(streamUrl)) {
    throw new Error('Stream URL contains ad domain — blocked');
  }

  return streamUrl;
}

/**
 * Full client-side resolver: from IMDB ID to playable HLS URL.
 * Used when the server doesn't have the provider=vega endpoint yet.
 * Falls back to pure client-side flow.
 */
export async function resolveVegaFullClientSide(imdbId, options = {}) {
  const GEMMA_HOST = 'https://gemma416okl.com';

  // Step 1: Get player config from gemma
  const res = await fetch(`${GEMMA_HOST}/play/${imdbId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Gemma returned ${res.status}`);
  const html = await res.text();

  const m = html.match(/let\s+p3\s*=\s*(\{.*?\});/s);
  if (!m) throw new Error('Could not parse p3 config from gemma page');
  const p3 = JSON.parse(m[1].replace(/\\\//g, '/'));

  // Step 2: Get language tracks
  const tracksRes = await fetch(p3.file, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-TOKEN': p3.key,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!tracksRes.ok) throw new Error(`Playlist returned ${tracksRes.status}`);
  const tracks = JSON.parse(await tracksRes.text());

  const TRANSLATOR_MAP = { '1': 'english', '3': 'tamil', '4': 'telugu', '5': 'hindi', '6': 'hindi-subbed', '7': 'kannada' };
  const mapped = tracks.map(t => ({
    title: t.title,
    translator: t.translator,
    language: TRANSLATOR_MAP[t.translator] || t.title?.toLowerCase() || 'unknown',
    file: t.file,
    id: t.id,
  }));

  // Pick preferred language
  const preferred = options.preferredLanguage || 'hindi';
  const selected = mapped.find(t => t.language === preferred) || mapped.find(t => t.language === 'hindi') || mapped[0];

  // Step 3: Get HLS URL (client-side, IP-bound)
  const streamUrl = await resolveHlsFromReference({
    playlistUrl: p3.file,
    csrfKey: p3.key,
    trackFile: selected.file,
  });

  return {
    success: true,
    streamUrl,
    allTracks: mapped.map(t => ({ title: t.title, language: t.language, id: t.id })),
    selectedTrack: selected.title,
    // Return reference data so the caller can re-resolve for language switches
    reference: { playlistUrl: p3.file, csrfKey: p3.key },
  };
}
