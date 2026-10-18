import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css';
import DesktopApp from './DesktopApp.jsx';
import { AuthProvider } from '@app/context/AuthContext';
import { ToastProvider } from '@app/components/Toast';
import { loadThemePref, applyThemePref } from './theme.js';

// Mark the shell for the anime theme scope (index.html already sets it, but be
// defensive in case of HMR root swaps). Appearance theme + accent applied
// before first paint so there is no flash of the default palette.
document.documentElement.classList.add('kyzen-desktop');
try {
  applyThemePref(loadThemePref());
} catch { /* malformed theme pref — CSS defaults still apply */ }

// Packaged desktop loads from file://, where relative /api calls have no host.
// Point those at the hosted API so streams/metadata keep working outside dev.
const DESKTOP_API_BASE = window.location.protocol === 'file:'
  ? (import.meta.env.VITE_API_BASE || 'https://stream.kyzenhub.site')
  : '';
if (DESKTOP_API_BASE && typeof window.fetch === 'function') {
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) input = DESKTOP_API_BASE + input;
    return origFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <DesktopApp />
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);
