import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'Kakumei';
// Production app is served under the /app base (see vite --base + Caddy).
const SITE_URL = 'https://stream.kyzenhub.site';
const APP_URL = `${SITE_URL}/app`;

export default function SeoHead({
  title,
  description,
  image,
  url,
  type = 'website',
  video,
  releaseDate,
  rating,
  genre,
  structuredData,
}) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - Free Movies, TV Shows & Anime Streaming`;
  const desc = description || 'Stream movies, TV shows, and anime in HD for free. Dual audio, fast servers, clean UI.';
  // No broken default: only emit og:image when the caller supplies a real image.
  const ogImage = image || null;
  const pageUrl = url || SITE_URL;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={pageUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:url" content={pageUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      {video && <meta property="og:video" content={video} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {/* Extra SEO */}
      {releaseDate && <meta property="og:release_date" content={releaseDate} />}
      {rating && <meta property="og:rating" content={String(rating)} />}
      {genre && <meta name="keywords" content={`${genre}, streaming, watch online, free, HD, dual audio`} />}

      {/* Schema.org JSON-LD */}
      {structuredData && (
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      )}
    </Helmet>
  );
}

// Helper: build Movie/TV structured data
export function buildMovieSchema(media, type) {
  if (!media) return null;
  const isTV = type === 'tv';
  return {
    '@context': 'https://schema.org',
    '@type': isTV ? 'TVSeries' : 'Movie',
    name: media.title || media.name,
    description: media.overview || '',
    image: media.poster_path ? `https://image.tmdb.org/t/p/w780${media.poster_path}` : undefined,
    datePublished: media.release_date || media.first_air_date || undefined,
    aggregateRating: media.vote_average ? {
      '@type': 'AggregateRating',
      ratingValue: media.vote_average,
      bestRating: 10,
      ratingCount: media.vote_count || 1,
    } : undefined,
    genre: (media.genres || []).map(g => g.name),
    ...(isTV ? {
      numberOfSeasons: media.number_of_seasons,
      numberOfEpisodes: media.number_of_episodes,
    } : {
      duration: media.runtime ? `PT${media.runtime}M` : undefined,
    }),
  };
}

// Helper: build search results structured data
export function buildSearchSchema(query, results) {
  if (!results?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'SearchResultsPage',
    name: `Search results for "${query}"`,
    url: `${APP_URL}/search?q=${encodeURIComponent(query)}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: results.length,
      itemListElement: results.slice(0, 10).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Movie',
          name: r.title || r.name,
          url: `${APP_URL}/play/${r.media_type || 'movie'}/${r.id}`,
          image: r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : undefined,
        },
      })),
    },
  };
}

export { APP_URL };
