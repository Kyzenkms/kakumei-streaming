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
  episodes: async (tvId: string, season: number) => api.unwrap(await get<any>(`/api/tmdb/tv/${cleanId(tvId)}/season/${season}`)),
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
};

function cleanId(id: string): string {
  return String(id || '').split('_')[0];
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
