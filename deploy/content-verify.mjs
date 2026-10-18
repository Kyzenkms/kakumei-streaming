// Public content smoke: movies, series, anime, search, details, sources.
// Usage: node content-verify.mjs [base]
const base = (process.argv[2] || 'https://stream.kyzenhub.site').replace(/\/$/, '');
let fail = 0;
const get = async (p) => {
  const r = await fetch(base + p, { signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, raw: t.slice(0, 80) };
};
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`);
  if (!cond) fail += 1;
};

const trendM = await get('/api/tmdb/trending/movie/week?page=1');
check('trending movies', trendM.status === 200 && trendM.json?.results?.length > 0, `-> ${trendM.json?.results?.[0]?.title}`);

const trendT = await get('/api/tmdb/trending/tv/week?page=1');
check('trending series', trendT.status === 200 && trendT.json?.results?.length > 0, `-> ${trendT.json?.results?.[0]?.name}`);

const anime = await get('/api/tmdb/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=1');
check('anime discover', anime.status === 200 && anime.json?.results?.length > 0, `-> ${anime.json?.results?.[0]?.name}`);

const searchT = await get('/api/tmdb/search/multi?query=doraemon&language=en-US');
const doraHit = searchT.json?.results?.find((x) => (x.title || x.name || '').toLowerCase().includes('doraemon'));
check('tmdb search (search bar)', searchT.status === 200 && !!doraHit, `-> ${doraHit?.title || doraHit?.name}`);

const searchN = await get('/api/netmirror/search?q=doraemon');
check('netmirror search (search bar)', Array.isArray(searchN.json) && searchN.json.length > 0, `-> ${searchN.json?.[0]?.title} [${searchN.json?.[0]?.language}]`);

const detM = await get('/api/tmdb/movie/634649?language=en-US');
check('movie details', detM.status === 200 && !!detM.json?.title, `-> ${detM.json?.title}`);

const detT = await get('/api/tmdb/tv/65733?language=en-US');
check('series details (Doraemon)', detT.status === 200 && !!detT.json?.name, `-> ${detT.json?.name}`);

const srcM = await get('/api/netmirror/sources?id=634649&type=movie&title=Spider-Man%20No%20Way%20Home');
check('movie sources (playable)', srcM.status === 200 && srcM.json?.success === true && (srcM.json?.sources?.length > 0 || (srcM.json?.embeds?.length > 0)), `-> sources=${srcM.json?.sources?.length || 0} embeds=${srcM.json?.embeds?.length || 0}`);

const srcT = await get('/api/netmirror/sources?id=65733&type=tv&season=1&episode=1&title=Doraemon');
check('episode sources (playable)', srcT.status === 200 && srcT.json?.success === true && (srcT.json?.sources?.length > 0 || (srcT.json?.embeds?.length > 0)), `-> sources=${srcT.json?.sources?.length || 0} embeds=${srcT.json?.embeds?.length || 0} lang=${srcT.json?.language}`);

console.log(fail === 0 ? 'CONTENT PASS' : `CONTENT FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
