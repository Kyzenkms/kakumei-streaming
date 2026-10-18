// Run: node deploy/verify.mjs https://stream.kyzenhub.site
import assert from 'node:assert/strict';

const base = process.argv[2] || 'https://stream.kyzenhub.site';
const checks = [
  ['/', 200, 'text/html'],
  ['/app/', 200, 'text/html'],
  ['/app/search', 200, 'text/html'],
  ['/app/assets/missing-asset.js', 404, null],
  ['/api/health', 200, 'application/json'],
  ['/downloads/Kakumei-Setup-0.1.5.exe', 200, null, 'HEAD'],
  ['/downloads/kakumei-1.0.0.apk', 200, null, 'HEAD'],
];
for (const [path, status, contentType, method = 'GET'] of checks) {
  const response = await fetch(new URL(path, base), { method, signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, status, `${path}: HTTP ${response.status}`);
  if (contentType) assert.ok(response.headers.get('content-type')?.includes(contentType), `${path}: unexpected content type`);
  if (path === '/api/health') assert.equal((await response.json()).ok, true);
  if (path === '/') assert.match(await response.text(), /Kakumei/i);
  if (path.startsWith('/downloads/')) {
    assert.match(response.headers.get('content-disposition') || '', /attachment/);
    assert.ok(Number(response.headers.get('content-length')) > 1000000, `${path}: missing artifact`);
  }
  if (!response.bodyUsed) await response.body?.cancel();
  console.log(`PASS ${method} ${path} (${status})`);
}

// Miruro harvest needs Playwright Chromium on the origin (regressed to 501
// before the browser was installed). Cached 20min, so repeats are fast.
{
  const miruro = await fetch(new URL('/api/miruro/token?anilistId=16498&slug=attack-on-titan&ep=1&server=bee', base), { signal: AbortSignal.timeout(90000) });
  assert.equal(miruro.status, 200, `miruro: HTTP ${miruro.status}`);
  const mj = await miruro.json();
  assert.ok(mj.url?.startsWith('http'), 'miruro: missing stream url');
  console.log(`PASS GET /api/miruro/token (200, ${mj.cached ? 'cached' : 'fresh'})`);
}

// TMDB proxy must never leak HTML (tunnel/edge pages) as JSON. Upstream may be
// down, in which case the proxy returns 502 JSON — still a pass for the proxy.
for (const tmdbPath of ['/api/tmdb/movie/66601', '/api/tmdb/tv/65733?language=en-US']) {
  const response = await fetch(new URL(tmdbPath, base), { signal: AbortSignal.timeout(25000) });
  assert.ok([200, 502].includes(response.status), `${tmdbPath}: HTTP ${response.status}`);
  assert.ok(response.headers.get('content-type')?.includes('application/json'), `${tmdbPath}: unexpected content type`);
  const text = await response.text();
  assert.match(text.trimStart(), /^[{[]/, `${tmdbPath}: non-JSON body leaked`);
  const data = JSON.parse(text);
  if (response.status === 200) assert.ok(data.title || data.name || data.id, `${tmdbPath}: missing title`);
  else assert.ok(data.error, `${tmdbPath}: missing error payload`);
  console.log(`PASS GET ${tmdbPath} (${response.status}, json)`);
}
