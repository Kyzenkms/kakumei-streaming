// Kakumei Desktop — main process
// ---------------------------------------------------------------------------
// The ONE thing this desktop app can do that the browser cannot: forge the
// Referer header that NetMirror's CDN (bcdnxw/sacdn/*.hakunaymatata.com, served
// through *.watch21/*.watch22/*.pro21/*.proxy22) demands. The CDN whitelists
// only a couple of referers (filmboom.top / netfilm.world) and returns
// 206 video/mp4 with CORS:* once present — otherwise 429. A browser forbids
// setting Referer cross-origin; a native app rewrites it freely via
// session.webRequest. That unlocks NetMirror's OWN players + full dub selection
// with ZERO proxy and ZERO bandwidth on our side (CDN → device directly).
'use strict';

const { app, BrowserWindow, session, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');

// NetMirror's CDN serves many titles as HEVC/H.265 MP4 (hvcC). Chromium ships
// with HEVC decode DISABLED by default, which plays audio only and leaves the
// video black. This switch turns on platform (hardware) HEVC decode so
// H.265 streams render like NetMirror's own mobile player.
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

const DEV_URL = process.env.KAKUMEI_DEV_URL || '';
const isDev = !!DEV_URL;

// Hosts whose requests must carry the whitelisted Referer/Origin to be served.
// Seeds: build-time probe data (gen-gated-hosts.cjs → gated-hosts.json) plus
// the built-in families; the runtime CDN monitor (server-side, /api/netmirror/cdns)
// merges in any newly rotated host family without a rebuild.
const BUILTIN_GATED = ['hakunaymatata.com', 'watch21.shop', 'watch22.shop', 'pro21.shop', 'proxy22.shop'];
let GATED_HOSTS_LIST = BUILTIN_GATED;
try {
  const gen = require('./gated-hosts.json');
  const hosts = Array.isArray(gen.hosts) && gen.hosts.length ? gen.hosts : BUILTIN_GATED;
  GATED_HOSTS_LIST = hosts;
  console.log(`[main] gated hosts from probe (${gen.updatedAt || 'unknown age'}): ${hosts.join(', ')}`);
} catch (_) { /* no build-time probe — builtin families only */ }
function buildGatedRegex() {
  const esc = GATED_HOSTS_LIST.map((h) => String(h).replace(/\./g, '\\.'));
  return new RegExp('(^|\\.)(' + esc.join('|') + ')$', 'i');
}
let GATED_HOST = buildGatedRegex();
// The CDN's accepted referer allowlist, verified live by the server-side monitor
// (cdn-refresh.cjs). Filmboom.top is the current entry; loadLiveCdnConfig()
// refreshes it at startup + every 30 min so a NetMirror rotation self-heals.
// miruro's vault CDNs (keeply.top now; piltover.li/watami.win legacy) answer
// to strm.cx instead (206 with it, 403 without) — per-host referer below.
let SPOOF_REFERER = 'https://filmboom.top/';
let SPOOF_ORIGIN = 'https://filmboom.top';
const CDN_CONFIG_URL = 'https://stream.kyzenhub.site/api/netmirror/cdns';
async function loadLiveCdnConfig() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(CDN_CONFIG_URL, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return;
    const d = await r.json();
    if (d && typeof d.referer === 'string' && d.referer) {
      SPOOF_REFERER = d.referer;
      SPOOF_ORIGIN = d.referer.replace(/\/+$/, '');
      console.log(`[main] live referer from CDN monitor: ${SPOOF_REFERER}`);
    }
    if (Array.isArray(d?.gatedHosts) && d.gatedHosts.length) {
      const merged = [...new Set([...GATED_HOSTS_LIST, ...d.gatedHosts.map(String)])];
      if (merged.length !== GATED_HOSTS_LIST.length) {
        GATED_HOSTS_LIST = merged;
        GATED_HOST = buildGatedRegex();
        console.log(`[main] gated hosts from live config: ${GATED_HOSTS_LIST.join(', ')}`);
      }
    }
  } catch (_) { /* offline — keep built-in values */ }
}
const VAULT_HOST = /(^|\.)(keeply\.top|piltover\.li|watami\.win)$/i;
const VAULT_REFERER = 'https://strm.cx/';
const VAULT_ORIGIN = 'https://strm.cx';

let mainWindow = null;

function installRefererRewrite(ses) {
  // Rewrite outgoing headers for gated CDN hosts so their media/manifest/segment
  // requests are accepted. Everything else is left untouched.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    try {
      const host = new URL(details.url).hostname;
      if (VAULT_HOST.test(host)) {
        const h = details.requestHeaders;
        h['Referer'] = VAULT_REFERER;
        h['Origin'] = VAULT_ORIGIN;
        return callback({ requestHeaders: h });
      }
      if (GATED_HOST.test(host)) {
        const h = details.requestHeaders;
        h['Referer'] = SPOOF_REFERER;
        h['Origin'] = SPOOF_ORIGIN;
        // A desktop/mobile UA matches the flow NetMirror's own player uses.
        return callback({ requestHeaders: h });
      }
    } catch (_) { /* non-URL / internal request */ }
    callback({ requestHeaders: details.requestHeaders });
  });

  // Some gated hosts omit permissive CORS on preflight for XHR manifest loads;
  // normalize so dash.js/hls.js inside the renderer can read them.
  ses.webRequest.onHeadersReceived((details, callback) => {
    try {
      const host = new URL(details.url).hostname;
      if (GATED_HOST.test(host) || VAULT_HOST.test(host)) {
        const h = details.responseHeaders || {};
        h['access-control-allow-origin'] = ['*'];
        h['access-control-allow-headers'] = ['*'];
        h['access-control-expose-headers'] = ['Content-Length', 'Content-Range', 'Accept-Ranges'];
        return callback({ responseHeaders: h });
      }
    } catch (_) {}
    callback({ responseHeaders: details.responseHeaders });
  });
}

// ── Auto-update ────────────────────────────────────────────────────────────
// Feed: GitHub releases on the public repo (build.publish in package.json →
// app-update.yml inside the packaged app). Downloads in the background;
// installs on quit, or immediately via the prompt once downloaded.
function setupAutoUpdate() {
  if (isDev || !app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (e) => console.log('[updater] error:', (e && e.message) || e));
    autoUpdater.on('update-downloaded', (info) => {
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Kakumei update ready',
          message: `Kakumei ${info.version} has been downloaded.`,
          detail: 'Restart now to finish updating. If you choose Later, it installs next time you close the app.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((r) => {
          if (r.response === 0) autoUpdater.quitAndInstall();
        });
    });
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch (e) {
    console.log('[updater] disabled:', (e && e.message) || e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#07070b',
    show: false,
    autoHideMenuBar: true,
    title: 'Kakumei',
    // Taskbar / window icon while running. The installer + shortcut icon come
    // from build/icon.ico via electron-builder; this keeps dev + runtime branded.
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // Frameless; our React DesktopTitlebar draws the controls. No
    // titleBarOverlay on Windows — it reserved a native caption strip that
    // double-stacked with our custom bar and left a persistent gap.
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open target=_blank / external links in the system browser, never a new
  // Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep in-app navigation on our own origin; bounce stray external nav out.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const ok = url.startsWith(DEV_URL) || url.startsWith('file://') || url.startsWith('app://');
    if (!ok) { e.preventDefault(); shell.openExternal(url); }
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    // DevTools no longer auto-open (it spawned stray windows); use Ctrl+Shift+I.
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Window state → renderer, for the custom titlebar maximize/restore icon.
  const emit = (s) => mainWindow?.webContents.send('window:state', s);
  mainWindow.on('maximize', () => emit('maximized'));
  mainWindow.on('unmaximize', () => emit('normal'));
  mainWindow.on('enter-full-screen', () => emit('fullscreen'));
  mainWindow.on('leave-full-screen', () => emit('normal'));
}

// ── Window control IPC (custom titlebar) ───────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => !!mainWindow?.isMaximized());
ipcMain.handle('app:platform', () => process.platform);
ipcMain.handle('app:version', () => app.getVersion());

// Single-instance: focus the existing window instead of spawning a second.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(async () => {
    await loadLiveCdnConfig();
    installRefererRewrite(session.defaultSession);
    setInterval(loadLiveCdnConfig, 30 * 60 * 1000);
    Menu.setApplicationMenu(null); // custom in-app menus; no native menubar
    createWindow();
    setupAutoUpdate();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
