
const TMDB_BASE = '/api/tmdb';

// Cache of franchise-root NetMirror searches used by the search bridge below.
const _nmRootCache = new Map();
const IMG_BASE = 'https://image.tmdb.org/t/p';

const buildUrl = (baseUrl, params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
};

const createProvider = ({ key, label, badge = null, priority, supportsLanguage = false, netmirror = false, netmirrorMirror = 0, movie, tv }) => ({
  key, label, badge, priority, supportsLanguage, netmirror, netmirrorMirror, movie, tv,
});

export function sanitizeCdnUrl(url) {
  if (!url) return url;
  return url;
}

// Raw backend/player codes (resolve_miss, fetch_failed, dash_manifest_failed…)
// must never reach the user. One mapping, used by every client surface.
const STREAM_ERROR_COPY = [
  [/resolve_miss|no[_\s-]?results?|no[_\s-]?sources?|no[_\s-]?stream|missing_id/i,
    'Title not found on our sources right now. Try a Server below — brand-new releases can take a while to appear.'],
  [/fetch_failed|failed to fetch|network|timeout|timed out|offline|load failed|fetchfailed/i,
    "Couldn't reach our servers. Check your connection, then hit Retry."],
  [/media_source_failed|dash_|manifest|hevc|decode|black screen|embed_failed|harvest_failed/i,
    "This file wouldn't play on your device. Try another Server below."],
];
export function friendlyStreamError(raw) {
  const msg = String(raw || '');
  if (!msg) return 'Something went wrong with this stream. Try another server or Retry.';
  for (const [re, copy] of STREAM_ERROR_COPY) {
    if (re.test(msg)) return copy;
  }
  console.warn('[stream-error]', msg);
  return 'Something went wrong with this stream. Try another server or Retry.';
}

// ─── NetMirror stream resolver ───
export async function resolveNetMirrorStream({ id, type = 'tv', season = 1, episode = 1, mirror = 0, title = '', language = '', isNetMirror = false, fresh = false }) {
  try {
    const titleParam = title ? `&title=${encodeURIComponent(title)}` : '';
    const langParam = language ? `&language=${encodeURIComponent(language)}` : '';
    const nmParam = isNetMirror ? `&isNetMirror=true` : '';
    const freshParam = fresh ? `&fresh=1` : '';
    const tsParam = `&_t=${Date.now()}`;
    const res = await fetch(
      `/api/netmirror/sources?id=${id}&type=${type}&season=${season}&episode=${episode}&mirror=${mirror}${titleParam}${langParam}${nmParam}${freshParam}${tsParam}`
    );
    const data = await res.json();
    const embeds = Array.isArray(data.embeds) ? data.embeds.filter(e => e && e.url) : [];
    // Embed-only success: NetMirror offers no direct stream for this title,
    // only its own third-party server embeds (2026 titles). Surface as success
    // so the UI offers those servers instead of a dead error.
    if (data?.success && data?.isEmbedOnly && embeds.length) {
      return { success: true, title: data.title || 'Video', language: data.language || '', quality: 'Auto', url: '', sources: [], subtitles: data.subtitles || [], embeds, isHls: false, isEmbedOnly: true };
    }
    if (!data?.success || !Array.isArray(data.sources) || data.sources.length === 0) {
      return { success: false, error: data?.error || data?.code || 'no_sources', code: data?.code || data?.error || 'no_sources', stage: data?.stage || 'lookup', title: data?.title || '' };
    }
    const streamTitle = data.title || 'Video';
    const cleanedSources = (data.sources || []).map(s => ({
      ...s,
      url: sanitizeCdnUrl(s.url)
    }));
    const primary = cleanedSources[0];

    return {
      success: true,
      title: streamTitle,
      language: data.language || '',
      quality: primary?.quality || 'Auto',
      url: primary?.url || '',
      sources: cleanedSources,
      subtitles: data.subtitles || [],
      embeds,
      isHls: data.isHls || false,
    };
  } catch (e) {
    return { success: false, error: e.message, code: 'fetch_failed', stage: 'lookup' };
  }
}


// ─── Alternate stream resolver ───
// Two modes:
//   1. Server mode: /api/netmirror/sources?provider=vega (when server supports it)
//   2. Client mode: full client-side flow against the provider's own hosts
// Both return the same format as resolveNetMirrorStream for ArtPlayer integration.
export async function resolveVegaStreamForPlayer({ tmdbId, type = 'movie', language = 'hindi', title = '' }) {
  try {
    const idParts = String(tmdbId).split('_');
    const cleanTmdbId = idParts[0];
    const mediaType = type === 'tv' ? 'tv' : 'movie';

    // ── Try server mode first ──
    try {
      const titleParam = title ? `&title=${encodeURIComponent(title)}` : '';
      const langParam = language ? `&language=${encodeURIComponent(language)}` : '';
      const res = await fetch(
        `/api/netmirror/sources?id=${cleanTmdbId}&type=${mediaType}&season=1&episode=1&mirror=0&provider=vega${titleParam}${langParam}&_t=${Date.now()}`
      );
      const data = await res.json();
      if (data?.success && data.sources?.length > 0) {
        // Server returned the reference — resolve HLS URL client-side
        const { resolveHlsFromReference } = await import('./vegaStream');
        const ref = data.vegaReference;
        if (ref?.playlistUrl && ref?.csrfKey && ref?.trackFile) {
          const streamUrl = await resolveHlsFromReference(ref);
          return {
            success: true,
            title: data.title || 'Video',
            sources: [{ url: streamUrl, quality: 'Auto', language: data.selectedTrack || language }],
            subtitles: [],
            allTracks: data.allTracks || [],
            selectedTrack: data.selectedTrack || language,
            isHls: true,
          };
        }
      }
    } catch { /* server mode not available, fall through to client mode */ }

    // ── Client mode: full flow in browser ──
    const { resolveVegaFullClientSide } = await import('./vegaStream');

    // Get IMDB ID
    let imdbId = null;
    try {
      const res = await fetch(`/api/tmdb/${mediaType}/${cleanTmdbId}?append_to_response=external_ids`);
      const data = await res.json();
      imdbId = data.external_ids?.imdb_id;
    } catch { /* TMDB lookup failed */ }

    if (!imdbId) {
      try {
        const res = await fetch(`/api/tmdb/${mediaType}/${cleanTmdbId}`);
        const data = await res.json();
        const tmdbTitle = data.title || data.name;
        if (tmdbTitle) {
          const searchRes = await fetch(`/api/netmirror/search?q=${encodeURIComponent(tmdbTitle)}`);
          const results = await searchRes.json();
          const match = results.find(r => {
            const rTitle = (r.title || '').toLowerCase();
            return rTitle.includes(tmdbTitle.toLowerCase().slice(0, 8));
          });
          if (match?.imdb_id) imdbId = match.imdb_id;
        }
      } catch { /* search failed */ }
    }

    if (!imdbId) imdbId = `tt${cleanTmdbId}`;

    const result = await resolveVegaFullClientSide(imdbId, { preferredLanguage: language });
    if (!result.success) return { success: false, error: 'VegaMovies stream not available' };

    return {
      success: true,
      title: `Video (${result.selectedTrack})`,
      sources: [{ url: result.streamUrl, quality: 'Auto', language }],
      subtitles: [],
      allTracks: result.allTracks || [],
      selectedTrack: result.selectedTrack || language,
      isHls: true,
      vegaReference: result.reference, // save for language switches
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

const MIRRORS = [
  createProvider({
    key: 'NETMIRROR_M1',
    label: 'Server 1',
    badge: 'Ad-Free',
    priority: 0,
    netmirror: true,
    netmirrorMirror: 0,
  }),
];

const PROVIDERS = [
  ...MIRRORS,
  createProvider({
    key: 'VIDEASY',
    label: 'Videasy',
    badge: 'Backup (Ads)',
    isBackup: true,
    hasAds: true,
    priority: 10,
    movie: ({ id }) => `https://player.videasy.to/movie/${parseId(id)}`,
    tv: ({ id, season, episode }) => `https://player.videasy.to/tv/${parseId(id)}/${season}/${episode}`,
  }),
  createProvider({
    key: 'VIDLINK',
    label: 'VidLink',
    badge: 'Backup (Ads)',
    isBackup: true,
    hasAds: true,
    priority: 11,
    movie: ({ id }) => `https://vidlink.pro/movie/${parseId(id)}`,
    tv: ({ id, season, episode }) => `https://vidlink.pro/tv/${parseId(id)}/${season}/${episode}`,
  }),
  createProvider({
    key: 'AUTOEMBED',
    label: 'AutoEmbed',
    badge: 'Backup (Ads)',
    isBackup: true,
    hasAds: true,
    priority: 12,
    movie: ({ id }) => `https://autoembed.co/movie/tmdb/${parseId(id)}`,
    tv: ({ id, season, episode }) => `https://autoembed.co/tv/tmdb/${parseId(id)}-${season}-${episode}`,
  }),
];

const SOURCES = Object.fromEntries(PROVIDERS.map((provider) => [provider.key, provider]));

const parseId = (id) => {
  if (typeof id === 'string' && id.includes('_')) {
    return id.split('_')[0];
  }
  return id;
};

export const API_CONFIG = {
  IMG_URL: `${IMG_BASE}/w342`,
  IMG_URL_W500: `${IMG_BASE}/w500`,
  ORIGINAL_IMG: `${IMG_BASE}/original`,
  BACKDROP_URL: `${IMG_BASE}/w1280`,
  PROVIDERS,
  SOURCES,
};

export const fetchTrending = async (type = 'movie') => {
  try {
    const res = await fetch(`${TMDB_BASE}/trending/${type}/week`);
    const data = await res.json();
    return (data.results || []).map((item) => ({ ...item, isTV: type === 'tv' }));
  } catch {
    return [];
  }
};

export async function fetchAdultContent(lang = '') {
  try {
    const url = lang ? `/api/netmirror/adult?lang=${encodeURIComponent(lang)}` : '/api/netmirror/adult';
    const res = await fetch(url);
    return (await res.json()).map(item => ({
      ...item,
      isTV: item.media_type === 'tv' || (item.title && /S\d+/i.test(item.title)),
      isAdult: true
    }));
  } catch { return []; }
}

export async function fetchAdultLanguages() {
  try {
    const res = await fetch('/api/netmirror/adult-languages');
    return await res.json();
  } catch { return []; }
}

export const fetchDiscover = async (type = 'movie', category = 'trending', queryParams = {}) => {
  try {
    let endpoint = `${TMDB_BASE}/trending/${type}/week`;
    const params = { ...queryParams };

    const isFiltered = queryParams.genre || queryParams.with_genres || queryParams.status;

    if (category === 'popular') {
      endpoint = `${TMDB_BASE}/${type}/popular`;
    } else if (category === 'top_rated') {
      endpoint = `${TMDB_BASE}/${type}/top_rated`;
    } else if (isFiltered || category === 'anime' || type === 'anime' || queryParams.cat === 'anime') {
      if (category === 'anime' || type === 'anime' || queryParams.cat === 'anime') {
        endpoint = `${TMDB_BASE}/discover/tv`;
        params.with_genres = params.with_genres || '16';
        params.with_original_language = params.with_original_language || 'ja';
        if (!params.sort_by) params.sort_by = 'popularity.desc';
      } else {
        endpoint = `${TMDB_BASE}/discover/${type}`;
        if (!params.sort_by) params.sort_by = 'popularity.desc';
        if (queryParams.genre) {
          params.with_genres = queryParams.genre;
          delete params.genre;
        }
      }
    } else if (category === 'adult') {
      return []; // handled by fetchAdultContent
    } else if (category === 'trending') {
      endpoint = `${TMDB_BASE}/trending/${type}/week`;
    }

    const url = buildUrl(endpoint, params);
    const res = await fetch(url);
    const data = await res.json();
    
    // Fetch page 2 for more items
    let allResults = data.results || [];
    if (allResults.length >= 20 && !params.page) {
      try {
        const url2 = buildUrl(endpoint, { ...params, page: 2 });
        const res2 = await fetch(url2);
        const data2 = await res2.json();
        allResults = [...allResults, ...(data2.results || [])];
      } catch { /* page 2 failed, use page 1 only */ }
    }
    
    const isActuallyTV = type === 'tv' || type === 'anime' || category === 'anime' || queryParams.cat === 'anime';
    
    return allResults.map((item) => ({ 
      ...item, 
      isTV: isActuallyTV 
    }));
  } catch (err) {
    console.error('Fetch error:', err);
    return [];
  }
};

export const fetchDiscoverByLang = async (lang, type = 'movie') => {
  try {
    const res = await fetch(`/api/netmirror/search?q=&lang=${encodeURIComponent(lang)}`);
    const data = await res.json();
    return (data || []).map(item => ({
      ...item,
      isTV: item.media_type === 'tv',
      isNetMirror: true,
    }));
  } catch { return []; }
};

export const searchMedia = async (query) => {
  if (!query) return [];
  const q = query.toLowerCase().trim();

  // Strip language keywords from the core search term for better matching
  const langWords = ['hindi','english','spanish','french','german','japanese','korean','portuguese','italian','chinese','arabic','turkish','russian','thai','dub','dubbed','sub','subbed'];
  const coreWords = q.split(/\s+/).filter(w => w && !langWords.includes(w));
  const coreQuery = coreWords.join(' ');

  // Detect explicit language request in query
  const langKeywords = {
    hindi: 'hi', english: 'en', spanish: 'es', french: 'fr',
    german: 'de', japanese: 'ja', korean: 'ko', portuguese: 'pt',
    italian: 'it', chinese: 'zh',
  };
  const explicitLang = Object.entries(langKeywords).find(([kw]) => q.includes(kw));
  const requestedLang = explicitLang ? explicitLang[1] : null;

  // Search TMDB in only 2 languages for speed (English + Hindi)
  const tmdbPromise = (async () => {
    try {
      const langs = [
        { code: 'en-US', label: 'English' },
        { code: 'hi-IN', label: 'Hindi' },
      ];
      const responses = await Promise.all(
        langs.map(l => fetch(`${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&language=${l.code}`))
      );
      const allData = await Promise.all(responses.map(r => r.json()));
      const results = [];
      const seen = new Set();

      allData.forEach((data, idx) => {
        const langCode = langs[idx].code.split('-')[0];
        (data.results || []).forEach(item => {
          if ((item.media_type === 'movie' || item.media_type === 'tv') && !seen.has(item.id)) {
            seen.add(item.id);
            results.push({
              ...item,
              isTV: item.media_type === 'tv',
              displayLanguage: langs[idx].label,
              _langCode: langCode,
            });
          }
        });
      });
      return results;
    } catch { return []; }
  })();

  const netmirrorPromise = (async () => {
    try {
      const res = await fetch(`/api/netmirror/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      return (data || []).map(item => ({
        ...item,
        isTV: item.media_type === 'tv',
        isNetMirror: true,
      }));
    } catch { return []; }
  })();

  const [tmdbResults, netmirrorResults] = await Promise.all([tmdbPromise, netmirrorPromise]);

  // ─── Relevance scoring ───
  // Aliases + season/cour/part normalization for MATCHING only (mobile parity):
  // "bleach tybw" must score like "bleach thousand year blood war". Titles and
  // ids are never rewritten anywhere.
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .replace(/\btybw\b/g, 'thousand year blood war')
    .replace(/\b(part|cour|season)\s*(\d+)\b/g, 's$2')
    .trim();
  const stop = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'on', 'in']);
  const tokensOf = (s) => norm(s).split(' ').filter(w => w && !stop.has(w));
  const overlap = (a, b) => { const s = new Set(b); return a.filter(w => s.has(w)).length; };
  const coreNorm = norm(coreQuery);
  const searchTerms = coreNorm.split(' ').filter(Boolean);

  const scoreItem = (item) => {
    const cleanTitle = norm(item.title || item.name);
    const terms = searchTerms;
    // Exact-title hits that are actually notable (have any traction); bare
    // exact matches like the pile of empty "Bleach" TMDB stubs must not
    // outrank the playable NetMirror entries.
    const solid = (item.popularity || 0) >= 2 || (item.vote_count || 0) >= 10;

    let score = 0;

    // Exact title match = huge score
    if (cleanTitle === coreNorm) score += solid ? 21000 : 12000;
    // Title starts with query
    else if (cleanTitle.startsWith(coreNorm)) score += 5000;
    // All terms appear in title
    else if (terms.every(t => cleanTitle.includes(t))) score += 3000;
    // Some terms match
    else {
      const matched = terms.filter(t => cleanTitle.includes(t)).length;
      score += (matched / terms.length) * 1000;
    }
    // Partial query match
    if (cleanTitle.includes(coreNorm)) score += 2000;

    // NetMirror titles are guaranteed streamable. When the base title (brackets,
    // "S1-S3" season suffixes stripped) cleanly matches the query, rank these
    // ABOVE TMDB metadata-only hits so users get a playable entry — otherwise the
    // TMDB card wins, then resolves to the wrong NetMirror stream on play.
    if (item.isNetMirror && coreNorm) {
      const normQ = coreNorm.replace(/\s+/g, '');
      const base = cleanTitle
        .replace(/\s*s\d+.*$/, '')            // strip S1 / S1-S3 / S1-S4 suffixes
        .replace(/\s+/g, '');
      if (base === normQ) score += 20000;                 // exact base = original series
      else if (base.startsWith(normQ)) score += 12000;     // franchise prefixes
      // Season groups (the series itself, e.g. "Bleach S1-S3", TYBW S1-S4) are
      // the primary intent of a written-title query — keep them above the
      // movie/dub side entries, which tie on the same franchise prefix.
      if (item.isTV) score += 3000;
    }

    // Popularity boost (normalized)
    score += Math.min((item.popularity || 0) * 0.5, 500);

    // Rating boost
    if (item.vote_average > 0) score += item.vote_average * 5;

    // Language priority: English > Hindi > others
    const itemLang = item.language || item._langCode || item.original_language || '';
    if (requestedLang) {
      // User explicitly asked for a language — boost matching, penalize others
      if (itemLang.startsWith(requestedLang)) score += 8000;
      else if (item.isNetMirror) score -= 3000;
    } else {
      // Default: English first, then Hindi, then others
      if (itemLang === 'en' || itemLang === 'english') score += 200;
      else if (itemLang === 'hi' || itemLang === 'hindi') score += 100;
    }

    // NetMirror items get slight boost if they have a language (dubbed content)
    if (item.isNetMirror && item.language && item.language !== 'original') score += 50;

    // Penalize low relevance — if title shares almost nothing with query
    if (score < 200 && terms.length > 0) score -= 5000;

    return score;
  };

  // Merge, deduplicate, score, and filter
  const allItems = [...tmdbResults, ...netmirrorResults];
  const deduped = new Map();

  for (const item of allItems) {
    const key = item.id;
    const existing = deduped.get(key);
    const score = scoreItem(item);
    if (!existing || score > existing._score) {
      deduped.set(key, { ...item, _score: score });
    }
  }

  // Rank tiers: exact TMDB title first, then NetMirror (guaranteed playable),
  // then TMDB prefix hits. NetMirror's base-exact boost (+20000) used to
  // outrank the real TMDB entry for a bare franchise query like "bleach".
  const tierOf = (x) => {
    const tt = norm(x.title || x.name);
    if (!x.isNetMirror && tt === coreNorm && ((x.popularity || 0) >= 2 || (x.vote_count || 0) >= 10)) return 3;
    if (x.isNetMirror) return 2;
    if (tt.startsWith(coreNorm)) return 1;
    return 0;
  };
  const byRank = (a, b) => (tierOf(b) - tierOf(a)) || (b._score - a._score);

  const results = [...deduped.values()].filter(item => item._score > 0).sort(byRank);

  // Franchise bridge (mirrors the mobile app): a multi-word query can match
  // only side entries on NetMirror (e.g. the "The Calamity" recap movie) while
  // the grouped parent seasons are titled differently. Re-query NetMirror with
  // the franchise root and surface the parent, hint-badged — no merged labels,
  // ids and titles untouched.
  const terms = coreNorm.split(' ').filter(Boolean);
  const top = results.find(x => !x.isNetMirror);
  if (top && terms.length >= 2) {
    const topTokens = tokensOf(top.title || top.name);
    const needed = Math.min(2, Math.max(topTokens.length, 1));
    const topIsTV = top.isTV ?? (top.media_type === 'tv');
    const covered = results.some(x => x.isNetMirror && (x.isTV ?? false) === topIsTV
      && overlap(tokensOf(x.title || x.name), topTokens) >= needed);
    const root = topTokens[0];
    if (root && !covered) {
      if (!_nmRootCache.has(root)) {
        _nmRootCache.set(root, fetch(`/api/netmirror/search?q=${encodeURIComponent(root)}`)
          .then(r => r.json())
          .then(data => (data || []).map(item => ({ ...item, isTV: item.media_type === 'tv', isNetMirror: true })))
          .catch(() => []));
      }
      try {
        const extra = await _nmRootCache.get(root);
        const hint = `↳ ${String(top.title || top.name || '').slice(0, 34)}`;
        for (const x of extra) {
          if (!x || !x.id || deduped.has(x.id)) continue;
          if (overlap(tokensOf(x.title || x.name), topTokens) < needed) continue;
          deduped.set(x.id, { ...x, _score: scoreItem(x) + 5000, _hint: hint });
          results.push(deduped.get(x.id));
        }
        results.sort(byRank);
      } catch (_) {}
    }
  }

  return results.slice(0, 30);
};

export const getDetails = async (id, isTV) => {
  if (!id || id === 'undefined') return null;
  try {
    const type = isTV ? 'tv' : 'movie';
    const cleanId = parseId(id);
    const res = await fetch(`${TMDB_BASE}/${type}/${cleanId}?append_to_response=external_ids,credits,videos`);
    return await res.json();
  } catch {
    return null;
  }
};

export const getSeasons = async (tvId) => {
  try {
    const cleanId = parseId(tvId);
    const res = await fetch(`${TMDB_BASE}/tv/${cleanId}`);
    const data = await res.json();
    return data.seasons || [];
  } catch {
    return [];
  }
};

export const getEpisodes = async (tvId, seasonNumber) => {
  try {
    const cleanId = parseId(tvId);
    const res = await fetch(`${TMDB_BASE}/tv/${cleanId}/season/${seasonNumber}`);
    const data = await res.json();
    return data.episodes || [];
  } catch {
    return [];
  }
};

export const getRecommendations = async (id, isTV) => {
  try {
    const type = isTV ? 'tv' : 'movie';
    const cleanId = parseId(id);
    const res = await fetch(`${TMDB_BASE}/${type}/${cleanId}/recommendations`);
    const data = await res.json();
    return (data.results || []).slice(0, 18).map((item) => ({ ...item, isTV }));
  } catch {
    return [];
  }
};

export const getSimilar = async (id, isTV) => {
  try {
    const type = isTV ? 'tv' : 'movie';
    const cleanId = parseId(id);
    const res = await fetch(`${TMDB_BASE}/${type}/${cleanId}/similar`);
    const data = await res.json();
    return (data.results || []).slice(0, 12).map((item) => ({ ...item, isTV }));
  } catch {
    return [];
  }
};

export const getTranslations = async (id, isTV) => {
  try {
    const type = isTV ? 'tv' : 'movie';
    const cleanId = parseId(id);
    const res = await fetch(`${TMDB_BASE}/${type}/${cleanId}/translations`);
    const data = await res.json();
    const langs = (data.translations || [])
      .map((translation) => ({ code: translation.iso_639_1, name: translation.english_name }))
      .filter((lang) => lang.code && lang.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return [...new Map(langs.map((lang) => [lang.code, lang])).values()];
  } catch {
    return [];
  }
};

// ─── NetMirror available languages for a title ───
export const getNetmirrorLanguages = async (title, opts = {}) => {
  if (!title) return [];
  const p = new URLSearchParams({ title });
  if (opts.year) p.set('year', String(opts.year));
  if (opts.type) p.set('type', String(opts.type));
  if (opts.id) p.set('id', String(opts.id));
  try {
    const res = await fetch(`/api/netmirror/languages?${p.toString()}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

// ─── TMDB search by title (for NetMirror content thumbnails) ───
export const tmdbSearchByTitle = async (title, isTV) => {
  if (!title) return null;
  try {
    const type = isTV ? 'tv' : 'movie';
    const res = await fetch(`${TMDB_BASE}/search/${type}?query=${encodeURIComponent(title)}`);
    const data = await res.json();
    const results = data.results || [];
    if (!results.length) return null;
    // Pick the best match — prefer exact title, then most popular
    const clean = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const scored = results.map(r => {
      const rTitle = (r.title || r.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      let s = 0;
      if (rTitle === clean) s += 10000;
      else if (rTitle.includes(clean) || clean.includes(rTitle)) s += 5000;
      s += (r.popularity || 0);
      return { ...r, _score: s };
    }).sort((a, b) => b._score - a._score);
    return scored[0];
  } catch { return null; }
};

// ─── TMDB full details (for NetMirror content) ───
export const tmdbGetDetails = async (tmdbId, isTV) => {
  if (!tmdbId) return null;
  try {
    const type = isTV ? 'tv' : 'movie';
    const res = await fetch(`${TMDB_BASE}/${type}/${tmdbId}?append_to_response=credits,videos`);
    return await res.json();
  } catch { return null; }
};