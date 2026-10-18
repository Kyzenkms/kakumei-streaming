// Cache for resolved NetMirror streams.
//
// Resolve latency is the single biggest cause of "sometimes fast, sometimes
// takes forever" — the backend retries with sleeps and can fall back to a
// title search. Once we have a working stream for (id, season, episode) it is
// good for a while, so replaying that episode (or coming back to it) should be
// instant instead of paying the whole resolve again.
//
// Two layers: an in-memory Map (this tab, fastest) and sessionStorage (survives
// reload / back-navigation in the same tab).

const KEY = 'ks_stream_v1';
const TTL = 30 * 60 * 1000; // 30 min — signed CDN urls expire
const MAX_ENTRIES = 40;
const NEGATIVE_TTL = 45 * 1000; // remember failures only briefly

const mem = new Map();

function now() { return Date.now(); }

function loadDisk() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function saveDisk(obj) {
  try { sessionStorage.setItem(KEY, JSON.stringify(obj)); } catch { /* quota / blocked */ }
}

export function cacheKey(id, season, episode, mirror = 0) {
  return `${id}:${season}:${episode}:${mirror}`;
}

/** Trim to the fields the player actually needs — keeps sessionStorage small. */
function trimResult(result) {
  if (!result || !result.success) return null;
  const sources = (result.sources || []).map(s => ({
    url: s.url,
    quality: s.quality,
    type: s.type,
    label: s.label,
  }));
  if (!sources.length) return null;
  return {
    success: true,
    url: result.url || sources[0].url,
    sources,
    subtitles: result.subtitles || [],
    isHls: !!result.isHls,
    cachedAt: now(),
  };
}

export function getCached(key) {
  const hit = mem.get(key);
  if (hit) {
    const age = now() - (hit.cachedAt || 0);
    if (hit.failed) {
      return age < NEGATIVE_TTL ? { failed: true } : (mem.delete(key), null);
    }
    return age < TTL ? hit : (mem.delete(key), null);
  }
  const disk = loadDisk();
  const d = disk[key];
  if (!d) return null;
  const age = now() - (d.cachedAt || 0);
  if (d.failed) return age < NEGATIVE_TTL ? { failed: true } : null;
  if (age > TTL) return null;
  mem.set(key, d); // promote
  return d;
}

export function setCached(key, result) {
  const trimmed = trimResult(result);
  if (trimmed) {
    mem.set(key, trimmed);
  } else {
    mem.set(key, { failed: true, cachedAt: now() });
  }
  persist();
}

function persist() {
  const out = {};
  const entries = [...mem.entries()].sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0));
  entries.slice(0, MAX_ENTRIES).forEach(([k, v]) => { out[k] = v; });
  saveDisk(out);
}

export function clearStreamCache() {
  mem.clear();
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
