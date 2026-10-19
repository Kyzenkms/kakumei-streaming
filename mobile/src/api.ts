let BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://stream.kyzenhub.site').replace(/\/$/, '');

export function setApiBase(url: string) {
  if (url && url.trim()) BASE = url.trim().replace(/\/$/, '');
}
export const getApiBase = () => BASE;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const _nmRootCache = new Map<string, Promise<any[]>>();
const SEARCH_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'on', 'in']);
function searchNorm(s: any): string {
  let t = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  t = t.replace(/\btybw\b/g, 'thousand year blood war');
  t = t.replace(/\b(part|cour|season)\s*(\d+)\b/g, 's$2');
  return t.trim();
}
function searchTokens(s: any): string[] {
  return searchNorm(s).split(' ').filter((w) => w && !SEARCH_STOP.has(w));
}
function tokenOverlap(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.filter((w) => set.has(w)).length;
}

export const api = {
  // TMDB proxy endpoints return {page, results, ...}; unwrap to the array.
  unwrap: (data: any): any[] => Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []),
  trending: async (type: 'movie' | 'tv') => api.unwrap(await get<any>(`/api/tmdb/trending/${type}/week`)),
  discover: async (type: string, category = 'trending', params = '') =>
    api.unwrap(await get<any>(`/api/tmdb/discover/${type}${params ? `?${params}` : ''}`)),
  details: (type: string, id: string) => get<any>(`/api/tmdb/${type}/${cleanId(id)}?append_to_response=external_ids,credits,videos`),
  recs: async (type: string, id: string) => api.unwrap(await get<any>(`/api/tmdb/${type}/${cleanId(id)}/recommendations`)),
  seasons: async (tvId: string) => (await get<any>(`/api/tmdb/tv/${cleanId(tvId)}`))?.seasons || [],
  // TMDB season payloads are {id, name, episodes:[...]} — not the {results}
  // shape api.unwrap expects, so unwrap the episodes field explicitly.
  episodes: async (tvId: string, season: number) => {
    const d = await get<any>(`/api/tmdb/tv/${cleanId(tvId)}/season/${season}`);
    return Array.isArray(d) ? d : (Array.isArray(d?.episodes) ? d.episodes : []);
  },
  search: async (q: string) => {
    const query = q.trim();
    const tmdb = get<any>(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`).then(api.unwrap).catch(() => []);
    const nm = get<any>(`/api/netmirror/search?q=${encodeURIComponent(query)}`)
      .then((d: any) => (Array.isArray(d) ? d : []).map((x: any) => ({ ...x, isTV: x.media_type === 'tv', isNetMirror: true })))
      .catch(() => []);
    const [a, b] = await Promise.all([tmdb, nm]);

    const coreQ = searchNorm(query);
    const terms = coreQ.split(' ').filter(Boolean);
    const normQ = coreQ.replace(/\s+/g, '');
    const score = (x: any): number => {
      const tt = searchNorm(x.title || x.name || '');
      const solid = (x.popularity || 0) >= 2 || (x.vote_count || 0) >= 10;
      let s = 0;
      if (tt === coreQ) s += solid ? 21000 : 12000;
      else if (tt.startsWith(coreQ)) s += 5000;
      else if (terms.every((t) => tt.includes(t))) s += 3000;
      else s += (terms.filter((t) => tt.includes(t)).length / Math.max(terms.length, 1)) * 1000;
      s += Math.min((x.popularity || 0) * 0.5, 500);
      if (x.vote_average > 0) s += x.vote_average * 5;
      if (x.isNetMirror && normQ) {
        const base = tt.replace(/\s*s\d+.*$/, '').replace(/\s+/g, '');
        if (base === normQ) s += 20000;
        else if (base.startsWith(normQ)) s += 12000;
        // Season groups (the series itself) are the primary intent of a
        // written-title query — keep them above movie/dub side entries.
        if (x.isTV) s += 3000;
      }
      return s;
    };
    const tierOf = (x: any): number => {
      const tt = searchNorm(x.title || x.name || '');
      if (!x.isNetMirror && tt === coreQ && ((x.popularity || 0) >= 2 || (x.vote_count || 0) >= 10)) return 3;
      if (x.isNetMirror) return 2;
      if (tt.startsWith(coreQ)) return 1;
      return 0;
    };
    const key = (x: any) => `${x.id}-${x.media_type || ''}-${x.isNetMirror ? 'nm' : 'tm'}`;
    const byRank = (x: any, y: any) => (tierOf(y) - tierOf(x)) || (y._score - x._score);

    const seen = new Set<string>();
    const list = [...a, ...b]
      .filter((x: any) => {
        if (!x || !x.id) return false;
        const k = key(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((x: any) => ({ ...x, _score: score(x) }))
      .filter((x: any) => x._score > 0)
      .sort(byRank);

    // Franchise bridge: a multi-word query whose TMDB top hit is a series can
    // match only side entries on NetMirror (e.g. the "The Calamity" recap
    // movie) while the grouped parent seasons sit under a differently-titled
    // entry. Re-query NetMirror with the franchise root and surface the
    // parent, hint-badged — titles and ids stay untouched.
    const top = list.find((x: any) => !x.isNetMirror);
    if (top && terms.length >= 2) {
      const topTokens = searchTokens(top.title || top.name);
      const needed = Math.min(2, Math.max(topTokens.length, 1));
      const topIsTV = top.isTV ?? (top.media_type === 'tv' || Boolean(top.first_air_date));
      const covered = list.some((x: any) => x.isNetMirror && (x.isTV ?? false) === topIsTV
        && tokenOverlap(searchTokens(x.title || x.name), topTokens) >= needed);
      const root = topTokens[0];
      if (root && !covered) {
        if (!_nmRootCache.has(root)) {
          _nmRootCache.set(root, get<any>(`/api/netmirror/search?q=${encodeURIComponent(root)}`)
            .then((d: any) => (Array.isArray(d) ? d : []).map((x: any) => ({ ...x, isTV: x.media_type === 'tv', isNetMirror: true })))
            .catch(() => []));
        }
        const extra = await _nmRootCache.get(root)!;
        const hint = `↳ ${String(top.title || top.name || '').slice(0, 34)}`;
        for (const x of extra) {
          if (!x || !x.id || seen.has(key(x))) continue;
          if (tokenOverlap(searchTokens(x.title || x.name), topTokens) < needed) continue;
          seen.add(key(x));
          list.push({ ...x, _score: score(x) + 5000, _hint: hint });
        }
        list.sort(byRank);
      }
    }

    return list.slice(0, 30);
  },
  nmContent: async (id: string, type: string) =>
    get<any>(`/api/netmirror/content?id=${encodeURIComponent(id)}&type=${type}`),
  languages: async (title: string) => {
    if (!title) return [];
    try {
      const d = await get<any>(`/api/netmirror/languages?title=${encodeURIComponent(title)}`);
      return Array.isArray(d) ? d : [];
    } catch { return []; }
  },
  health: async () => get<any>(`/api/health`),
  cdns: async () => get<any>(`/api/netmirror/cdns`).catch(() => null),
  sources: async (opts: { id: string; type: string; season?: number; episode?: number; title?: string; language?: string; isNetMirror?: boolean; fresh?: boolean }) =>
    get<any>(`/api/netmirror/sources?id=${opts.id}&type=${opts.type}&season=${opts.season || 1}&episode=${opts.episode || 1}${opts.title ? `&title=${encodeURIComponent(opts.title)}` : ''}${opts.language ? `&language=${encodeURIComponent(opts.language)}` : ''}${opts.isNetMirror ? '&isNetMirror=true' : ''}${opts.fresh ? '&fresh=1' : ''}`),
  subsFind: async (params: string) => get<any[]>(`/api/netmirror/subs-find?${params}`),
};

function cleanId(id: string): string {
  return String(id || '').split('_')[0];
}

// Best TMDB twin for a NetMirror catalog item. TMDB search returns the
// original and its remake under one title ("One Piece": 1999 anime vs 2023
// live action), so pick the candidate that can actually host the season/
// episode being watched; when several can, the longer-running one wins.
// ponytail: run-length tiebreak assumes originals outlive remakes — fine for
// the anime/remake collisions this exists for.
export async function pickTmdbMatch(results: any[], type: string, title: string, season = 1, episode = 1): Promise<any | null> {
  const wantTV = type === 'tv';
  const year = (String(title).match(/\b(19|20)\d{2}\b/) || [])[0] || '';
  const name = String(title).replace(/\b(19|20)\d{2}\b/g, ' ').replace(/[[\]()]/g, ' ').trim() || String(title);
  const wantNorm = searchNorm(name);
  const wantTokens = searchTokens(name);
  const pool = (Array.isArray(results) ? results : []).filter((r: any) => r?.id && !r.isNetMirror
    && (wantTV ? r.media_type === 'tv' || !!r.first_air_date : r.media_type === 'movie' || !!r.release_date));
  if (!pool.length) return null;
  const yearOf = (r: any) => Number(String(r.first_air_date || r.release_date || '').slice(0, 4)) || 0;
  const scored = pool.map((r: any) => {
    const norm = searchNorm(r.title || r.name || '');
    const overlap = tokenOverlap(searchTokens(r.title || r.name || ''), wantTokens) / Math.max(wantTokens.length, 1);
    let s = norm === wantNorm ? 100 : norm.startsWith(wantNorm) ? 60 : overlap * 40;
    if (year) s += yearOf(r) && Math.abs(yearOf(r) - Number(year)) <= 1 ? 50 : -25;
    s += Math.min((r.popularity || 0) / 100, 5);
    return { r, s };
  }).sort((a, b) => b.s - a.s);
  if (!wantTV) return scored[0].r;
  const top = scored.filter((x) => x.s >= scored[0].s - 30).slice(0, 3);
  if (top.length === 1) return top[0].r;
  const dets = await Promise.all(top.map(async (x) => {
    try {
      const d = await api.details('tv', String(x.r.id));
      return { r: x.r, s: x.s, seasons: Array.isArray(d?.seasons) ? d.seasons.filter((sn: any) => sn?.season_number > 0) : ([] as any[]) };
    } catch { return { r: x.r, s: x.s, seasons: [] as any[] }; }
  }));
  const fits = dets.filter((d) => {
    const sn = d.seasons.find((s: any) => s?.season_number === season);
    return !!sn && (sn.episode_count || 0) >= episode;
  });
  const pick = (fits.length ? fits : dets).sort((a, b) => (b.seasons.length - a.seasons.length) || (b.s - a.s))[0];
  return pick?.r || scored[0].r;
}

// NetMirror catalog titles carry language tags and season-range suffixes
// ("Breaking Bad S1-S5"), which TMDB search cannot match. Strip them before
// querying TMDB for metadata.
export function tmdbQuery(title: string): string {
  return String(title)
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s*\bS\d+\s*[-–]\s*S?\d+\b.*$/i, ' ')
    .replace(/\s*\bS\d+\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim() || String(title).trim();
}

const tmdbPickCache = new Map<string, Promise<any | null>>();

// Search + match for a title, deduped: the play screen resolves recs, the
// episode picker and the TMDB twin from the same lookup.
export function pickTmdbMatchCached(title: string, type: string, season = 1, episode = 1): Promise<any | null> {
  const q = tmdbQuery(title);
  if (!q) return Promise.resolve(null);
  const key = `${type}|${season}|${episode}|${q.toLowerCase()}`;
  const hit = tmdbPickCache.get(key);
  if (hit) return hit;
  const p = api.search(q).then((results) => pickTmdbMatch(results, type, q, season, episode));
  tmdbPickCache.set(key, p);
  p.catch(() => tmdbPickCache.delete(key));
  return p;
}

type SourcesOpts = {
  id: string; type: string; season?: number; episode?: number;
  title?: string; language?: string; isNetMirror?: boolean; fresh?: boolean;
};

// Prefetch stream resolution on play taps — the play screen consumes the same
// promise, so navigation lands on a ready player instead of "Starting server…".
const sourcesCache = new Map<string, Promise<any>>();
function sourcesCacheKey(o: SourcesOpts): string {
  return [o.id, o.type, o.season || 1, o.episode || 1, o.title || '', o.language || '', o.isNetMirror ? 1 : 0].join('|');
}
export function prefetchSources(o: SourcesOpts): Promise<any> {
  const key = sourcesCacheKey(o);
  const hit = sourcesCache.get(key);
  if (hit) return hit;
  const p = api.sources(o);
  sourcesCache.set(key, p);
  p.catch(() => { sourcesCache.delete(key); })
    .then(() => { setTimeout(() => sourcesCache.delete(key), 120000); });
  return p;
}

// Filled from the backend's /api/netmirror/cdns at runtime — keep no hardcoded
// CDN referer/host list in the client.
let _cdnCfg: { referer: string; gatedHosts: string[] } = { referer: '', gatedHosts: [] };
export const getCdnCfg = () => _cdnCfg;
export async function loadCdnCfg() {
  try {
    const d = await api.cdns();
    if (d && typeof d.referer === 'string' && d.referer) {
      _cdnCfg = { referer: d.referer, gatedHosts: Array.isArray(d.gatedHosts) ? d.gatedHosts : [] };
    }
  } catch { /* offline — keep last known referer */ }
  return _cdnCfg;
}
