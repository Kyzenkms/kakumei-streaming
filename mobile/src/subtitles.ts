// Subtitle engine for the mobile player — mirrors the web/desktop ArtPlayer
// customization (track, color, size, position, sync). Cues arrive as ready
// WebVTT from the backend's /proxy/subtitle endpoint; we parse and render our
// own overlay so styling works on every stream, not just native HLS tracks.

export type Cue = { start: number; end: number; text: string };

export type SubStyle = { color: string; size: number; position: number; sync: number };

export const SUB_STYLE_DEFAULT: SubStyle = { color: '#ffffff', size: 15, position: 12, sync: 0 };

// Colour wheel palette: a full 360° hue ring plus a black→white tone ring.
export const SUB_HUES = Array.from({ length: 24 }, (_, i) => `hsl(${i * 15}, 85%, 55%)`);
export const SUB_TONES = ['#000000', '#1a1a1a', '#333333', '#4d4d4d', '#808080', '#b3b3b3', '#e5e5e5', '#ffffff'];

// Dark subtitle colours need a light outline (the default black shadow makes
// them vanish on dark scenes).
export function isDarkColor(c: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return false;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.42;
}

// Slider ranges — continuous bars, no fixed presets.
export const SUB_RANGES = {
  size: { min: 10, max: 34, step: 1 },
  position: { min: 0, max: 90, step: 1 },
  sync: { min: -30, max: 30, step: 0.25 },
} as const;

function timeToSec(raw: string): number {
  const parts = String(raw || '')
    .trim()
    .split(':')
    .map((p) => parseFloat(p.replace(',', '.')));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function parseVtt(raw: string): Cue[] {
  const src = String(raw || '').replace(/\r/g, '');
  // HLS/WebVTT packs carry X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000.
  // Ignoring it shifts every cue by the map offset (subtitles late/early).
  const map = src.match(/X-TIMESTAMP-MAP\s*=\s*LOCAL:([\d:.]+)\s*,\s*MPEGTS:(\d+)/i);
  const offset = map ? Number(map[2]) / 90000 - timeToSec(map[1]) : 0;
  const cues: Cue[] = [];
  const blocks = src.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length || /^WEBVTT/.test(lines[0]) || /^NOTE/.test(lines[0])) continue;
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti === -1) continue;
    const [a, b] = lines[ti].split('-->');
    if (!a || !b) continue;
    const start = timeToSec(a) + offset;
    const end = timeToSec(b.trim().split(/\s+/)[0]) + offset;
    const text = lines
      .slice(ti + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .trim();
    if (text && isFinite(start) && isFinite(end) && end >= start) cues.push({ start, end, text });
  }
  cues.sort((x, y) => x.start - y.start);
  return cues;
}

// Displayed cue at playback time t — callers pass t = pos - sync, matching the
// web player. Binary search to the last cue starting at/before t, then a short
// backward scan to survive overlapping cues.
export function cueTextAt(cues: Cue[], t: number): string | null {
  if (!cues.length) return null;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) lo = mid + 1;
    else hi = mid - 1;
  }
  // Overlapping cues (e.g. a long line and a short interjection) mean the
  // last-started cue may already have ended while an earlier one is still on
  // screen — scan the recent window and keep the newest active cue.
  let best: Cue | null = null;
  for (let i = Math.min(hi, cues.length - 1); i >= 0 && i > hi - 12; i--) {
    const c = cues[i];
    if (t >= c.start && t <= c.end && (!best || c.start > best.start)) best = c;
  }
  return best ? best.text : null;
}
