import DOMPurify from 'dompurify';

const ANILIST_URL = '/api/anilist';

const query = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus, $genre: String) {
  Page (page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media (type: ANIME, sort: $sort, status: $status, genre: $genre) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      description
      status
      episodes
      nextAiringEpisode {
        airingAt
        timeUntilAiring
        episode
      }
      genres
      averageScore
      popularity
      season
      seasonYear
      format
    }
  }
}
`;

// Fallback to TMDB anime if AniList is rate-limited
async function fallbackTmdbAnime(page = 1) {
  try {
    const res = await fetch(`/api/tmdb/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(t => ({
      id: t.id,
      anilistId: t.id,
      title: t.name || t.original_name,
      name: t.name || t.original_name,
      overview: t.overview || '',
      poster_path: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
      backdrop_path: t.backdrop_path ? `https://image.tmdb.org/t/p/original${t.backdrop_path}` : null,
      vote_average: t.vote_average || 0,
      release_date: (t.first_air_date || '').slice(0, 4),
      first_air_date: (t.first_air_date || '').slice(0, 4),
      isTV: true,
      isAnime: true,
      media_type: 'tv',
      genres: [{ name: 'Animation' }, { name: 'Action' }],
    }));
  } catch (_) {
    return [];
  }
}

export const fetchAnilistTrending = async (page = 1, perPage = 20, genre = null) => {
  try {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        variables: {
          page,
          perPage,
          sort: ['TRENDING_DESC', 'POPULARITY_DESC'],
          ...(genre ? { genre } : {}),
        }
      })
    });
    if (!response.ok) {
      // If 429/5xx, try direct AniList or TMDB fallback
      const direct = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { page, perPage, sort: ['TRENDING_DESC', 'POPULARITY_DESC'], ...(genre ? { genre } : {}) } })
      }).catch(() => null);
      if (direct && direct.ok) {
        const directData = await direct.json();
        return (directData?.data?.Page?.media || []).map(mapAnilistToTMDB);
      }
      return await fallbackTmdbAnime(page);
    }
    const data = await response.json();
    if (!data?.data?.Page?.media) return await fallbackTmdbAnime(page);
    return data.data.Page.media.map(mapAnilistToTMDB);
  } catch (error) {
    console.warn('[AniList] fetch failed, using fallback:', error);
    return await fallbackTmdbAnime(page);
  }
};

export const fetchAnilistOngoing = async (page = 1, perPage = 20, genre = null) => {
  try {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        variables: {
          page,
          perPage,
          status: 'RELEASING',
          sort: ['POPULARITY_DESC'],
          ...(genre ? { genre } : {}),
        }
      })
    });
    if (!response.ok) {
      return await fallbackTmdbAnime(page);
    }
    const data = await response.json();
    if (!data?.data?.Page?.media) return await fallbackTmdbAnime(page);
    return data.data.Page.media.map(mapAnilistToTMDB);
  } catch (error) {
    console.warn('[AniList] fetch failed, using fallback:', error);
    return await fallbackTmdbAnime(page);
  }
};

const mapAnilistToTMDB = (anime) => ({
  id: anime.id,
  anilistId: anime.id,
  malId: anime.idMal,
  title: anime.title?.english || anime.title?.romaji || 'Anime',
  name: anime.title?.english || anime.title?.romaji || 'Anime',
  overview: anime.description ? DOMPurify.sanitize(anime.description, { ALLOWED_TAGS: [] }) : '',
  poster_path: anime.coverImage?.extraLarge || anime.coverImage?.large || '',
  backdrop_path: anime.bannerImage || '',
  vote_average: typeof anime.averageScore === 'number' ? anime.averageScore / 10 : 0,
  release_date: `${anime.seasonYear || ''}`,
  first_air_date: `${anime.seasonYear || ''}`,
  isTV: true,
  isAnime: true,
  media_type: 'tv',
  genres: (anime.genres || []).map(g => ({ name: g })),
  status: anime.status,
  episodes: anime.episodes,
  nextEpisode: anime.nextAiringEpisode,
});
