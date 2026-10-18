// Subtitle engine for the mobile player — mirrors the web/desktop ArtPlayer
// customization (track, color, size, position, sync). Cues arrive as ready
// WebVTT from the backend's /proxy/subtitle endpoint; we parse and render our
// own overlay so styling works on every stream, not just native HLS tracks.

export type Cue = { start: number; end: number; text: string };

export type SubStyle = { color: string; size: number; position: number; sync: number };

export const SUB_STYLE_DEFAULT: SubStyle = { color: '#ffffff', size: 15, position: 12, sync: 0 };

export const SUB_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#fde047' },
  { label: 'Cyan', value: '#22d3ee' },
  { label: 'Mint', value: '#4ade80' },
] as const;

export const SUB_SIZES = [
  { label: 'Small', value: 12 },
  { label: 'Default', value: 15 },
  { label: 'Large', value: 19 },
  { label: 'Huge', value: 25 },
] as const;

// Distance from the bottom of the video block, in px.
export const SUB_POSITIONS = [
  { label: 'Default', value: 12 },
  { label: 'Lower', value: 4 },
  { label: 'Raised', value: 46 },
  { label: 'High', value: 86 },
  { label: 'Very High', value: 126 },
] as const;

export const SUB_SYNCS = [
  { label: '-1.0s Early', value: -1 },
  { label: '-0.5s Early', value: -0.5 },
  { label: 'Normal', value: 0 },
  { label: '+0.5s Delay', value: 0.5 },
  { label: '+1.0s Delay', value: 1 },
] as const;

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
  const cues: Cue[] = [];
  const blocks = String(raw || '').replace(/\r/g, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length || /^WEBVTT/.test(lines[0]) || /^NOTE/.test(lines[0])) continue;
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti === -1) continue;
    const [a, b] = lines[ti].split('-->');
    if (!a || !b) continue;
    const start = timeToSec(a);
    const end = timeToSec(b.trim().split(/\s+/)[0]);
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
  for (let i = Math.min(hi, cues.length - 1); i >= 0 && i > hi - 12; i--) {
    const c = cues[i];
    if (t >= c.start && t <= c.end) return c.text;
    if (c.end < t) break;
  }
  return null;
}
