import { fileURLToPath, URL } from 'node:url';
import dns from 'node:dns';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

dns.setDefaultResultOrder('ipv4first');

export default defineConfig({
  root: fileURLToPath(new URL('./renderer', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    proxy: {
      '/image-proxy': { target: 'https://image.tmdb.org', changeOrigin: true, rewrite: (p) => p.replace(/^\/image-proxy/, '') },
      '/api': { target: 'http://localhost:3005', changeOrigin: true },
      '/proxy': { target: 'http://localhost:3005', changeOrigin: true },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
});
