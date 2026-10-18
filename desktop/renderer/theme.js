// Kakumei Desktop — theme system (appearance presets + accent overrides).
// All presets are dark (the shell hardcodes light-on-dark text), differing in
// canvas tint, surface depth, and signature accent. Persisted as one object.

import { DAISY_DARK } from './themes-daisy.js';

const BASE_THEMES = {
  midnight: {
    name: 'Midnight',
    desc: 'Indigo depth',
    bg: '#000000',
    bgElev0: '#07070e',
    surface1: '#0f0f23',
    surface2: '#15152e',
    surface3: '#1e1b4b',
    border: 'rgba(99, 91, 180, 0.18)',
    text: '#f8fafc',
    textSecondary: 'rgba(248, 250, 252, 0.72)',
    textMuted: 'rgba(248, 250, 252, 0.46)',
    accent: '#a855f7',
    accent2: '#ec4899',
    play: '#e11d48',
    onAccent: '#ffffff',
  },
  oled: {
    name: 'OLED',
    desc: 'Pure black',
    bg: '#000000',
    bgElev0: '#000000',
    surface1: '#0a0a0c',
    surface2: '#121214',
    surface3: '#1c1c20',
    border: 'rgba(255, 255, 255, 0.10)',
    text: '#fafafa',
    textSecondary: 'rgba(250, 250, 250, 0.70)',
    textMuted: 'rgba(250, 250, 250, 0.44)',
    accent: '#8b5cf6',
    accent2: '#d946ef',
    play: '#e11d48',
    onAccent: '#ffffff',
  },
  ocean: {
    name: 'Ocean',
    desc: 'Deep navy',
    bg: '#010409',
    bgElev0: '#020a14',
    surface1: '#062032',
    surface2: '#0a2c44',
    surface3: '#0e3a58',
    border: 'rgba(56, 189, 248, 0.16)',
    text: '#f0f9ff',
    textSecondary: 'rgba(240, 249, 255, 0.72)',
    textMuted: 'rgba(240, 249, 255, 0.46)',
    accent: '#22d3ee',
    accent2: '#38bdf8',
    play: '#0284c7',
    onAccent: '#032530',
  },
  ember: {
    name: 'Ember',
    desc: 'Warm charcoal',
    bg: '#0a0505',
    bgElev0: '#100807',
    surface1: '#1c100c',
    surface2: '#271512',
    surface3: '#3a1e17',
    border: 'rgba(251, 146, 60, 0.16)',
    text: '#fff7ed',
    textSecondary: 'rgba(255, 247, 237, 0.72)',
    textMuted: 'rgba(255, 247, 237, 0.46)',
    accent: '#fb923c',
    accent2: '#f43f5e',
    play: '#dc2626',
    onAccent: '#2a1000',
  },
};

// House presets first, then the ported dark pack.
export const THEMES = { ...BASE_THEMES, ...DAISY_DARK };

export const ACCENTS = [
  { name: 'Violet', accent: '#a855f7', accent2: '#ec4899', play: '#e11d48' },
  { name: 'Cyan', accent: '#22d3ee', accent2: '#38bdf8', play: '#0284c7' },
  { name: 'Blue', accent: '#60a5fa', accent2: '#818cf8', play: '#2563eb' },
  { name: 'Emerald', accent: '#34d399', accent2: '#2dd4bf', play: '#059669' },
  { name: 'Lime', accent: '#a3e635', accent2: '#34d399', play: '#65a30d' },
  { name: 'Amber', accent: '#f59e0b', accent2: '#f97316', play: '#dc2626' },
  { name: 'Orange', accent: '#fb923c', accent2: '#f43f5e', play: '#ea580c' },
  { name: 'Rose', accent: '#fb7185', accent2: '#e879f9', play: '#e11d48' },
];

const KEY = 'kakumei-theme';
const LEGACY_KEY = 'kyzen-accent';

function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function loadThemePref() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && THEMES[saved.theme]) return saved;
  } catch (_) {}
  // Migrate the legacy accent-only pref into the new shape.
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (legacy?.accent) {
      const match = ACCENTS.find((a) => a.accent === legacy.accent);
      return { theme: 'midnight', accent: match ? match.name : null };
    }
  } catch (_) {}
  return { theme: 'midnight', accent: null };
}

export function applyThemePref(pref) {
  const t = THEMES[pref.theme] || THEMES.midnight;
  const accent = (pref.accent && ACCENTS.find((a) => a.name === pref.accent)) || null;
  const a = accent ? accent.accent : t.accent;
  const a2 = accent ? accent.accent2 : t.accent2;
  const play = accent ? accent.play : t.play;
  const root = document.documentElement;
  root.style.setProperty('--kz-bg', t.bg);
  root.style.setProperty('--kz-bg-elev-0', t.bgElev0);
  root.style.setProperty('--kz-surface-1', t.surface1);
  root.style.setProperty('--kz-surface-2', t.surface2);
  root.style.setProperty('--kz-surface-3', t.surface3);
  root.style.setProperty('--kz-border', t.border);
  root.style.setProperty('--kz-text', t.text);
  root.style.setProperty('--kz-text-secondary', t.textSecondary);
  root.style.setProperty('--kz-text-muted', t.textMuted);
  root.style.setProperty('--kz-accent', a);
  root.style.setProperty('--kz-accent-2', a2);
  root.style.setProperty('--kz-accent-soft', hexToRgba(a, 0.16));
  root.style.setProperty('--kz-play', play);
  root.style.setProperty('--kz-gradient', `linear-gradient(120deg, ${a} 0%, ${a2} 100%)`);
  // Readable text on top of the accent (bright accents like lime/amber get
  // dark text, saturated ones keep white). Theme packs ship their own
  // primary-content; otherwise derive it from luminance.
  const lum = (() => {
    const h = a.replace('#', '');
    if (h.length !== 6) return 0;
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  })();
  root.style.setProperty('--kz-on-accent', t.onAccent && !accent ? t.onAccent : (lum > 0.45 ? '#191104' : '#ffffff'));
  try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (_) {}
}
