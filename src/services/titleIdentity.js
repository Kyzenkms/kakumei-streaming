/**
 * Canonical identity resolution.
 *
 * Problem this solves: every external provider keys off a DIFFERENT id.
 *   - hianime / miruro  → AniList id
 *   - TMDB-backed paths → TMDB id
 * and a title alone is ambiguous ("Reborn" has ~14 distinct works across
 * anime and live action). Resolving on title + year is what makes the extra
 * servers land on the correct work instead of a same-named one.
 *
 * Everything downstream (embeds, hianime, miruro hop/bee/moo) should ask this
 * module for ids rather than guessing from a title string.
 */

const TMDB_BASE = '/api/tmdb';
const ANILIST_API = 'https://graphql.anilist.co';
const CACHE_KEY = 'ks_identity_v1';
const TTL = 7 * 24 * 60 * 60 * 1000; // 7d — ids don't change
const MAX_ENTRIES = 300;

// ── normalisation ────────────────────────────────────────────────────────────
/**
 * Strip the noise that makes titles fail to match across sources:
 * language tags, season groupings, punctuation, subtitle markers.
 * "Bleach: TYBW (Dub) S1-S4 [Hindi]" → "bleach tybw"
 */
export function normalizeTitle(raw) {
  return String(raw || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s*\[[^\]]*\]/g, '')       // [Hindi], [English]
    .replace(/\s*\([^)]*\)/g, '')        // (Dub), (2023)
    .replace(/\b(dub|dubbed|sub|subbed)\b/gi, '')
    .replace(/\s*S\d+\s*-\s*S\d+/i, '')  // S1-S4
    .replace(/\s*S\d+(\s*S\d+)*\s*$/i, '') // trailing S1
    .replace(/\s*\d+\s*eps\b/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function yearOf(value) {
  const m = String(value || '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
}

// ── cache ────────────────────────────────────────────────────────────────────
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { return {}; }
}
function writeCache(obj) {
  try {
    const entries = Object.entries(obj).filter(([, v]) => v && Date.now() - v.t < TTL);
    entries.sort((a, b) => b[1].t - a[1].t);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, MAX_ENTRIES))));
  } catch { /* quota / disabled */ }
}

// ── scoring ──────────────────────────────────────────────────────────────────
/**
 * Score a candidate against the wanted title/year.
 * Returns 0 when it should be rejected outright (title or year mismatch).
 */
function score(candidateTitle, candidateYear, wantNorm, wantYear) {
  const norm = normalizeTitle(candidateTitle);
  if (!norm) return 0;

  let s = 0;
  if (norm === wantNorm) s += 1000;
  else if (norm.startsWith(wantNorm) || wantNorm.startsWith(norm)) s += 600;
  else if (norm.includes(wantNorm) || wantNorm.includes(norm)) s += 250;
  else return 0; // different work

  if (wantYear && candidateYear) {
    const delta = Math.abs(candidateYear - wantYear);
    if (delta === 0) s += 600;
    else if (delta === 1) s += 300;   // season rollover / air-date drift
    else if (delta <= 2) s += 100;
    else return 0;                    // wrong work — this is the "Reborn" guard
  }
  return s;
}

// ── TMDB ─────────────────────────────────────────────────────────────────────
async function resolveTmdb(title, year, isTV) {
  const wantNorm = normalizeTitle(title);
  if (!wantNorm) return null;
  const type = isTV ? 'tv' : 'movie';
  try {
    // Query with the NORMALISED title. Sending the raw one ("…War S1-S4",
    // "… [Hindi]") makes TMDB return zero results, which is what silently
    // produced a null tmdbId for grouped NetMirror titles.
    const res = await fetch(`${TMDB_BASE}/search/${type}?query=${encodeURIComponent(wantNorm)}`);
    if (!res.ok) return null;
    const data = await res.json();
    let best = null, bestScore = 0;
    for (const r of data.results || []) {
      const cyear = yearOf(r.release_date || r.first_air_date);
      const s = score(r.title || r.name, cyear, wantNorm, year) + Math.min((r.popularity || 0) / 100, 50);
      if (s > bestScore) { bestScore = s; best = { id: r.id, title: r.title || r.name, year: cyear }; }
    }
    // require at least a title-level match
    return bestScore >= 250 ? best : null;
  } catch { return null; }
}

// ── AniList ──────────────────────────────────────────────────────────────────
async function resolveAnilist(title, year) {
  const wantNorm = normalizeTitle(title);
  if (!wantNorm) return null;
  const query = `
    query ($q: String) {
      Page(perPage: 20) {
        media(search: $q, type: ANIME) {
          id
          episodes
          format
          startDate { year }
          title { romaji english native }
        }
      }
    }`;
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { q: normalizeTitle(title) } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const media = json?.data?.Page?.media || [];
    let best = null, bestScore = 0;
    for (const m of media) {
      const cyear = m.startDate?.year || 0;
      const titles = [m.title?.romaji, m.title?.english, m.title?.native].filter(Boolean);
      let s = 0;
      for (const t of titles) {
        const cand = score(t, cyear, wantNorm, year);
        if (cand > s) s = cand;
      }
      if (s > bestScore) {
        bestScore = s;
        best = { id: m.id, title: titles[0], year: cyear, episodes: m.episodes, format: m.format };
      }
    }
    return bestScore >= 250 ? best : null;
  } catch { return null; }
}

// ── public API ───────────────────────────────────────────────────────────────
/**
 * Resolve a work to canonical ids.
 *
 * @param {{title: string, year?: number|string, isTV?: boolean}} input
 * @returns {Promise<{tmdbId:number|null, anilistId:number|null, isAnime:boolean,
 *                    resolvedTitle:string|null, year:number, slug:string|null}>}
 */
export async function resolveIdentity({ title, year, isTV = false }) {
  const norm = normalizeTitle(title);
  const yr = yearOf(year);
  if (!norm) return { tmdbId: null, anilistId: null, isAnime: false, resolvedTitle: null, year: yr, slug: null };

  const key = `${norm}|${yr}|${isTV ? 'tv' : 'movie'}`;
  const cache = readCache();
  if (cache[key] && Date.now() - cache[key].t < TTL) return cache[key].v;

  // Both lookups are independent — run them together.
  const [tmdb, anilist] = await Promise.all([
    resolveTmdb(title, yr, isTV),
    resolveAnilist(title, yr),
  ]);

  // AniList only holds anime, so a confident hit there is the anime signal.
  const isAnime = !!anilist;
  const resolvedTitle = (isAnime ? anilist?.title : tmdb?.title) || title;

  const value = {
    tmdbId: tmdb?.id ?? null,
    anilistId: anilist?.id ?? null,
    isAnime,
    episodes: anilist?.episodes ?? null,
    resolvedTitle,
    year: yr || anilist?.year || tmdb?.year || 0,
    // url-safe slug for providers that need one (miruro uses /watch/{id}/{slug})
    slug: norm.replace(/\s+/g, '-'),
  };

  cache[key] = { t: Date.now(), v: value };
  writeCache(cache);
  return value;
}

/**
 * Resolve EVERY AniList entry belonging to an anime franchise, ordered by year.
 *
 * Why this exists: split-cour shows (Bleach TYBW, AOT Final Season, JJK S2…)
 * are modelled differently everywhere:
 *   - AniList   → one SEPARATE entry per cour, each restarting at ep 1
 *   - NetMirror → one grouped title, with real per-season episode counts
 *   - TMDB      → inconsistent (for TYBW it only has "Part 1", 1 season, 1 ep)
 *
 * So we use NetMirror's season list as the spine and map season N onto the Nth
 * AniList entry by year — then validate with the episode count. Anime providers
 * (hianime, miruro) need the per-cour anilistId, not the franchise id.
 */
export async function resolveAnimeSeasons({ title, year }) {
  const norm = normalizeTitle(title);
  if (!norm) return [];

  const key = `seasons|${norm}|${yearOf(year)}`;
  const cache = readCache();
  if (cache[key] && Date.now() - cache[key].t < TTL) return cache[key].v;

  const query = `
    query ($q: String) {
      Page(perPage: 30) {
        media(search: $q, type: ANIME, sort: START_DATE) {
          id episodes format startDate { year }
          title { romaji english native }
        }
      }
    }`;
  let entries = [];
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { q: norm } }),
    });
    const json = await res.json();
    const media = json?.data?.Page?.media || [];
    const wantYear = yearOf(year);

    entries = media
      .map(m => {
        const cyear = m.startDate?.year || 0;
        const titles = [m.title?.romaji, m.title?.english, m.title?.native].filter(Boolean);
        // Title-only scoring: a franchise legitimately spans many years
        // (Bleach TYBW runs 2022→2026), so applying the year guard here would
        // silently drop the later cours. Year is used only for ORDERING.
        let s = 0;
        for (const t of titles) s = Math.max(s, score(t, cyear, norm, 0));
        return { id: m.id, title: titles[0] || '', year: cyear, episodes: m.episodes || 0, _s: s };
      })
      // keep the franchise: same normalised stem, or a strong title match
      .filter(e => e._s >= 250)
      .sort((a, b) => (a.year - b.year) || (a.id - b.id));
  } catch { entries = []; }

  cache[key] = { t: Date.now(), v: entries };
  writeCache(cache);
  return entries;
}

/**
 * Pick the AniList entry for a given NetMirror season.
 * Season 1 -> the earliest entry, season 2 -> the next, and so on.
 * Episode count is used as a cross-check when NetMirror supplies one, because
 * ongoing shows can have fewer episodes available than the total.
 *
 * Returns null when we cannot be confident — callers should then NOT offer
 * the external server rather than risk playing the wrong episode.
 */
export function pickSeasonEntry(entries, seasonNumber, expectedEps = 0) {
  if (!entries || !entries.length || seasonNumber < 1) return null;
  if (entries.length === 1) return entries[0]; // single-cour — unambiguous

  const idx = seasonNumber - 1;
  if (idx >= entries.length) return null;      // season beyond what AniList knows
  const candidate = entries[idx];

  // Cross-check with episode count when we have one.
  // Allow the real season to have FEWER eps than AniList (still airing),
  // but never wildly more — that would mean we mapped the wrong cour.
  if (expectedEps > 0 && candidate.episodes > 0) {
    if (expectedEps > candidate.episodes + 2) return null;
  }
  return candidate;
}

export function clearIdentityCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
