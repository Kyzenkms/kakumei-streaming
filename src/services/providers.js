/**
 * Provider registry.
 *
 * One place that knows which external servers exist, what id each one needs,
 * and what it can serve. The player just renders whatever this returns for the
 * current title — adding a provider means adding one entry here.
 *
 * idKind:
 *   'anilist'  → needs the AniList id (hianime, miruro)
 *   'tmdb'     → needs the TMDB id (videasy)
 * scope:
 *   'anime'    → anime only
 *   'all'      → movies and tv
 */

export const PROVIDER_KINDS = {
  ANIME: 'anime',
  MIRURO: 'miruro',
  EMBED: 'embed',
  NM_PLAYER: 'nmplayer',
};

/**
 * @param {object} opts
 * @param {{tmdbId:number|null, anilistId:number|null, isAnime:boolean, slug:string|null}} opts.identity
 * @param {boolean} opts.isTV
 * @param {number}  opts.season
 * @param {number}  opts.episode
 * @param {'sub'|'dub'} opts.audio
 * @param {string}  opts.miruroServer  hop | bee | moo
 * @returns {Array<{key,label,group,badge,kind,idKind,embedUrl?}>}
 */
export function buildServerList({ identity, isTV, season, episode, audio = 'sub', miruroServer = 'hop', isNetMirror = false }) {
  if (!identity) return [];
  const { tmdbId, anilistId, isAnime } = identity;
  const list = [];

  // ── NetMirror's own player, signed server-side ───────────────────────────
  // The watchbox URL is signed on our backend and iframed. Their player runs
  // on their origin, so it sends the right Referer and the CDN streams
  // straight to the browser — no VPS proxy, no bandwidth.
  if (isNetMirror) {
    list.push({
      key: 'nm-player',
      label: 'NetMirror',
      group: 'Main',
      badge: 'HD',
      kind: PROVIDER_KINDS.NM_PLAYER,
      idKind: 'netmirror',
    });
  }

  // ── hianime — anime only, no browser needed ──────────────────────────────
  if (isAnime && anilistId) {
    const aud = audio === 'dub' ? 'dub' : 'sub';
    for (const [key, label, host] of [
      ['hianime-hd1', 'HD-1', 'tryembed'],
      ['hianime-hd2', 'HD-2', 'vidnest'],
    ]) {
      list.push({
        key,
        label: `hianime ${label}`,
        group: 'Anime',
        badge: aud === 'dub' ? 'DUB' : 'SUB',
        kind: PROVIDER_KINDS.ANIME,
        idKind: 'anilist',
        host,
        embedUrl: null, // built at play time (needs the resolved stream)
      });
    }
  }

  // ── miruro — anime only, harvested server-side ───────────────────────────
  // Live lineup (verified 2026-10): bee (streaming, sub) + kiwi (download /
  // hard-sub). hop/moo/ally are gone from the watch page.
  if (isAnime && anilistId) {
    for (const [key, label, badge] of [['bee', 'bee', 'SUB'], ['kiwi', 'kiwi', 'HD']]) {
      list.push({
        key: `miruro-${key}`,
        label: `miruro ${label}`,
        group: 'Anime',
        badge,
        kind: PROVIDER_KINDS.MIRURO,
        idKind: 'anilist',
        server: key,
      });
    }
  }

  // ── iframe embeds — movies, series AND anime ─────────────────────────────
  // Keyed off the TMDB id. These are third-party embed players built for
  // framing (no X-Frame-Options, no CSP frame-ancestors, no frame-busting /
  // parent-referer check), and they handle their own CDN referer internally —
  // so they stream straight to the user with zero proxy / zero bandwidth on
  // our side.
  if (tmdbId) {
    const s = season || 1;
    const e = episode || 1;
    // vidstuck + vidsync share the /embed/{type}/{id}[/{s}/{e}] shape.
    const slashPath = isTV ? `/tv/${tmdbId}/${s}/${e}` : `/movie/${tmdbId}`;
    // zxcprime uses a query-string season/episode on /player/{type}/{id}.
    const zxcPath = isTV ? `/player/tv/${tmdbId}?season=${s}&episode=${e}` : `/player/movie/${tmdbId}`;

    list.push({
      key: 'vidstuck',
      label: 'Server 1',
      group: 'Embeds',
      badge: 'FAST',
      kind: PROVIDER_KINDS.EMBED,
      idKind: 'tmdb',
      embedUrl: `https://vidstuck.xyz/embed${slashPath}?color=a855f7`,
    });
    list.push({
      key: 'vidsync',
      label: 'Server 2',
      group: 'Embeds',
      badge: 'MULTI',
      kind: PROVIDER_KINDS.EMBED,
      idKind: 'tmdb',
      embedUrl: `https://vidsync.pro/embed${slashPath}`,
    });
    list.push({
      key: 'zxcprime',
      label: 'Server 3',
      group: 'Embeds',
      badge: isTV ? 'SERIES' : 'MOVIE',
      kind: PROVIDER_KINDS.EMBED,
      idKind: 'tmdb',
      embedUrl: `https://player.zxcprime.xyz${zxcPath}`,
    });

    const path = isTV ? `/tv/${tmdbId}/${season || 1}/${episode || 1}` : `/movie/${tmdbId}`;
    list.push({
      key: 'vidlink',
      label: 'VidLink',
      group: 'Embeds',
      badge: isTV ? 'SERIES' : 'MOVIE',
      kind: PROVIDER_KINDS.EMBED,
      idKind: 'tmdb',
      embedUrl: `https://vidlink.pro${path}`,
    });
    // Kept for when they recover — currently 502 everywhere.
    list.push({
      key: 'videasy',
      label: 'Videasy',
      group: 'Embeds',
      badge: isTV ? 'SERIES' : 'MOVIE',
      kind: PROVIDER_KINDS.EMBED,
      idKind: 'tmdb',
      embedUrl: `https://player.videasy.to${path}`,
    });
  }

  return list;
}
