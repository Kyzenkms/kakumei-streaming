export type Tokens = {
  bg: string; surface: string; surface2: string; border: string;
  text: string; secondary: string; muted: string;
  accent: string; accentSoft: string; play: string; danger: string; onAccent: string;
};

type Base = Omit<Tokens, 'accent' | 'accentSoft' | 'play' | 'onAccent' | 'danger'> & {
  accent: string; accent2: string; play: string; onAccent: string;
};

const BASE: Record<string, { name: string; desc: string } & Base> = {
  midnight: {
    name: 'Midnight', desc: 'Indigo depth',
    bg: '#000000', surface: '#0f0f23', surface2: '#15152e',
    border: 'rgba(99,91,180,0.18)', text: '#f8fafc',
    secondary: 'rgba(248,250,252,0.72)', muted: 'rgba(248,250,252,0.46)',
    accent: '#a855f7', accent2: '#ec4899', play: '#e11d48', onAccent: '#ffffff',
  },
  oled: {
    name: 'OLED', desc: 'Pure black',
    bg: '#000000', surface: '#0a0a0c', surface2: '#121214',
    border: 'rgba(255,255,255,0.10)', text: '#fafafa',
    secondary: 'rgba(250,250,250,0.70)', muted: 'rgba(250,250,250,0.44)',
    accent: '#8b5cf6', accent2: '#d946ef', play: '#e11d48', onAccent: '#ffffff',
  },
  ocean: {
    name: 'Ocean', desc: 'Deep navy',
    bg: '#010409', surface: '#062032', surface2: '#0a2c44',
    border: 'rgba(56,189,248,0.16)', text: '#f0f9ff',
    secondary: 'rgba(240,249,255,0.72)', muted: 'rgba(240,249,255,0.46)',
    accent: '#22d3ee', accent2: '#38bdf8', play: '#0284c7', onAccent: '#032530',
  },
  ember: {
    name: 'Ember', desc: 'Warm charcoal',
    bg: '#0a0505', surface: '#1c100c', surface2: '#271512',
    border: 'rgba(251,146,60,0.16)', text: '#fff7ed',
    secondary: 'rgba(255,247,237,0.72)', muted: 'rgba(255,247,237,0.46)',
    accent: '#fb923c', accent2: '#f43f5e', play: '#dc2626', onAccent: '#2a1000',
  },
  synthwave: {
    name: 'Synthwave', desc: 'Neon nights',
    bg: '#09002f', surface: '#120b3d', surface2: '#1c184b',
    border: 'rgba(161,177,255,0.14)', text: '#a1b1ff',
    secondary: 'rgba(161,177,255,0.72)', muted: 'rgba(161,177,255,0.46)',
    accent: '#f861b4', accent2: '#71d1fe', play: '#f861b4', onAccent: '#500323',
  },
  dracula: {
    name: 'Dracula', desc: 'Purple haze',
    bg: '#1f202a', surface: '#232530', surface2: '#282a36',
    border: 'rgba(248,248,243,0.14)', text: '#f8f8f3',
    secondary: 'rgba(248,248,243,0.72)', muted: 'rgba(248,248,243,0.46)',
    accent: '#ff79c6', accent2: '#bd93f9', play: '#ff79c6', onAccent: '#16050e',
  },
  forest: {
    name: 'Forest', desc: 'Matcha dark',
    bg: '#110d0d', surface: '#161212', surface2: '#1b1717',
    border: 'rgba(202,201,201,0.14)', text: '#cac9c9',
    secondary: 'rgba(202,201,201,0.72)', muted: 'rgba(202,201,201,0.46)',
    accent: '#1fb854', accent2: '#1eb88e', play: '#1fb854', onAccent: '#000000',
  },
  night: {
    name: 'Night', desc: 'Midnight blue',
    bg: '#0a1120', surface: '#0c1425', surface2: '#0f172a',
    border: 'rgba(201,203,208,0.14)', text: '#c9cbd0',
    secondary: 'rgba(201,203,208,0.72)', muted: 'rgba(201,203,208,0.46)',
    accent: '#3abdf7', accent2: '#818cf8', play: '#3abdf7', onAccent: '#010d15',
  },
  luxury: {
    name: 'Black Luxury', desc: 'Onyx & gold',
    bg: '#000000', surface: '#0b0a06', surface2: '#131007',
    border: 'rgba(212,175,55,0.26)', text: '#faf6ea',
    secondary: 'rgba(250,246,234,0.74)', muted: 'rgba(250,246,234,0.46)',
    accent: '#d4af37', accent2: '#f2d98a', play: '#d4af37', onAccent: '#191104',
  },
};

export const THEMES: Record<string, { name: string; desc: string }> = Object.fromEntries(
  Object.entries(BASE).map(([k, v]) => [k, { name: v.name, desc: v.desc }]),
);

export const ACCENTS = [
  { name: 'Violet', accent: '#a855f7' },
  { name: 'Cyan', accent: '#22d3ee' },
  { name: 'Blue', accent: '#60a5fa' },
  { name: 'Emerald', accent: '#34d399' },
  { name: 'Amber', accent: '#f59e0b' },
  { name: 'Orange', accent: '#fb923c' },
  { name: 'Rose', accent: '#fb7185' },
];

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getTokens(themeKey: string, accentName: string | null): Tokens {
  const b = BASE[themeKey] || BASE.midnight;
  const custom = accentName && !accentName.startsWith('#') ? ACCENTS.find((a) => a.name === accentName) : null;
  const accent = accentName?.startsWith('#') ? accentName : custom ? custom.accent : b.accent;
  return {
    bg: b.bg, surface: b.surface, surface2: b.surface2, border: b.border,
    text: b.text, secondary: b.secondary, muted: b.muted,
    accent, accentSoft: hexToRgba(accent, 0.16),
    play: custom || accentName?.startsWith('#') ? accent : b.play,
    danger: '#f87171',
    onAccent: custom || accentName?.startsWith('#') ? (luminance(accent) > 0.45 ? '#191104' : '#ffffff') : b.onAccent,
  };
}

// Legacy default export shape (midnight) for any unmigrated usage.
export const dark: Tokens = getTokens('midnight', null);

export const IMG = 'https://image.tmdb.org/t/p/w500';
export const IMG_LARGE = 'https://image.tmdb.org/t/p/original';
