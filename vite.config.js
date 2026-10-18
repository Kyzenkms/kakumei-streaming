import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dns from 'dns'

dns.setDefaultResultOrder('ipv4first')

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.watch21.shop https://*.watch22.shop https://*.spedostream2.shop https://*.hakunaymatata.com https://*.aoneroom.com https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com https://*.firebasestorage.app https://apis.google.com https://image.tmdb.org https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://cdn.jsdelivr.net https://*.jsdelivr.net",
  "frame-src 'self' https: data: blob:",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: data: blob:",
  "style-src 'self' 'unsafe-inline' https://*.watch21.shop https://*.watch22.shop https://*.spedostream2.shop https://*.hakunaymatata.com https://*.aoneroom.com https://fonts.googleapis.com https://cdn.jsdelivr.net https://*.jsdelivr.net",
  "font-src 'self' https: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss:",
];

export default defineConfig({
  base: '/app/',
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Content-Security-Policy': CSP.join('; '),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
    proxy: {
      '/image-proxy': {
        target: 'https://image.tmdb.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image-proxy/, ''),
      },
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
      '/proxy': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
})
