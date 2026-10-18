// Kakumei Desktop — interface customization prefs (Home layout visibility).
// One small object in localStorage; Settings edits it, Home/Watch read it.
// Every key defaults to visible so a fresh profile shows the full app.

const KEY = 'kakumei-ui';

const DEFAULTS = {
  hero: true,
  continueWatching: true,
  sidebar: true,      // left icon rail open / closed
  hiddenRails: {},     // { [railKey]: true } — rail hidden from Home
  collapsedRails: {},  // { [railKey]: true } — rail minimized to its header
};

export function loadUiPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved };
  } catch (_) {}
  return { ...DEFAULTS };
}

export function saveUiPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event('storage'));
  } catch (_) {}
}
