import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'
import './index.css'
import { registerShieldSW } from './lib/AdShield.js'

// Register the KakumeiShield service worker immediately on app load
// so network-level ad blocking kicks in before any iframes load.
registerShieldSW();

// Unregister the old CDN Referer SW (/sw.js) — the referer-spoof approach is
// dead (Chrome rejects cross-origin referrer in the Request constructor, and
// no-cors media requests only surface as opaque responses). CDN playback is now
// fully direct via the un-gated sacdn3.watch22.shop, which needs no referer.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration('/sw.js').then((reg) => {
    if (reg) reg.unregister();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
