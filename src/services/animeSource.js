// Anime-only source helpers (hianime-family embeds, keyed on AniList id).
//
// IMPORTANT: these hosts only understand `sub` and `dub` (dub == English).
// They can NOT tell us whether a given entry is Hindi/Tamil/etc — that
// information only ever comes from NetMirror, which stores each language as a
// separate catalog entry. So nothing here should try to classify a language.

const ANILIST_API = 'https://graphql.anilist.co';
const CACHE_KEY = 'ks_anilist_v1';
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const SEARCH_QUERY = `
query($s:String){
  Page(perPage:6){
    media(search:$s, type:ANIME){
      id
      episodes
      format
      startDate { year }
      title { romaji english native }
    }
  }
}`;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { return {}; }
}
function writeCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* full or blocked */ }
}

function cacheKey(title, year) {
  return String(title || '').toLowerCase().trim() + ':' + String(year || '');
}

// Strip bracketed/parenthesised noise so "Bleach: TYBW (Dub)" still matches.
function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(dub|dubbed|sub|subbed)\b/gi, '')
    .trim();
}

/**
 * Resolve a title to an AniList entry. Returns { id, episodes, title } or null.
 * Results are cached per title+year so we only ever pay this once per title.
 */
export async function getAnilistMeta(title, year) {
  if (!title) return null;
  const key = cacheKey(title, year);
  const cache = readCache();
  if (cache[key] && Date.now() - cache[key].t < TTL) return cache[key].v;

  let value = null;
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { s: cleanTitle(title) } }),
    });
    const d = await res.json();
    const list = (d && d.data && d.data.Page && d.data.Page.media) || [];
    const y = Number(year) || 0;
    const byYear = y
      ? list.find(m => m.startDate && m.startDate.year && Math.abs(m.startDate.year - y) <= 1)
      : null;
    const pick = byYear || list[0];
    if (pick && pick.id) {
      value = {
        id: pick.id,
        episodes: pick.episodes || null,
        title: (pick.title && (pick.title.english || pick.title.romaji)) || null,
      };
    }
  } catch { value = null; }

  cache[key] = { t: Date.now(), v: value };
  writeCache(cache);
  return value;
}

// Servers we can build a URL for. Order = preference.
export const ANIME_SERVERS = [
  {
    key: 'tryembed',
    label: 'HD-1',
    host: 'tryembed.us.cc',
    build: (anilistId, ep, audio) => `https://tryembed.us.cc/embed/anime/${anilistId}/${ep}/${audio}`,
  },
  {
    key: 'vidnest',
    label: 'HD-2',
    host: 'vidnest.fun',
    build: (anilistId, ep, audio) => `https://vidnest.fun/anime/${anilistId}/${ep}/${audio}`,
  },
];

/** `audio` is 'sub' or 'dub'. 'dub' on these hosts means English. */
export function getAnimeEmbed(anilistId, ep, audio = 'sub', serverKey = 'tryembed') {
  if (!anilistId) return '';
  const srv = ANIME_SERVERS.find(s => s.key === serverKey) || ANIME_SERVERS[0];
  return srv.build(anilistId, Math.max(1, Number(ep) || 1), audio === 'dub' ? 'dub' : 'sub');
}

/** Only ever used when NetMirror gave us no episode metadata at all. */
export async function getAnimeEpisodeCount(title, year) {
  const meta = await getAnilistMeta(title, year);
  return meta && meta.episodes ? meta.episodes : null;
}

export function clearAnimeCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
