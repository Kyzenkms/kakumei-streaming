// Kakumei Desktop — preload bridge
// Exposes a minimal, safe surface to the renderer (contextIsolation ON). The
// renderer uses window.kakumei to detect it's running in the desktop shell and to
// drive the custom titlebar; it never gets raw Node/Electron access.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kakumei', {
  isDesktop: true,
  platform: () => ipcRenderer.invoke('app:platform'),
  version: () => ipcRenderer.invoke('app:version'),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onState: (cb) => {
      const handler = (_e, state) => cb(state);
      ipcRenderer.on('window:state', handler);
      return () => ipcRenderer.removeListener('window:state', handler);
    },
  },
  // Signals that NetMirror's own gated players are usable here (referer is
  // rewritten natively), so the renderer can prefer them over embeds.
  capabilities: { gatedNativePlayback: true },
});
