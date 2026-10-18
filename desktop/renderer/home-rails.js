// Home rail definitions — shared by Home (render) and Settings (toggles).
// Keep this list short: genre browsing lives under Movies/Series/Anime.

import { fetchDiscover } from '@app/services/api';

export const HOME_RAILS = [
  { key: 'trending-now', title: 'Trending Now', load: () => fetchDiscover('movie', 'trending') },
  { key: 'trending-series', title: 'Trending Series', load: () => fetchDiscover('tv', 'trending') },
  { key: 'trending-anime', title: 'Trending Anime', load: () => fetchDiscover('anime', 'trending') },
  { key: 'popular-movies', title: 'Popular Movies', load: () => fetchDiscover('movie', 'popular') },
  { key: 'popular-series', title: 'Popular Series', load: () => fetchDiscover('tv', 'popular') },
  { key: 'top-rated', title: 'Top Rated', load: () => fetchDiscover('movie', 'top_rated') },
];
