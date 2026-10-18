// Vite config for the Kyzen DESKTOP renderer.
// Reuses the root project's installed deps (react, tailwind v4) but has its own
// entry (desktop/renderer) and its own distinct anime-OTT UI — it does NOT
// render the website's screens. Builds to desktop/dist for electron-builder.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const root = path.resolve(import.meta.dirname, 'desktop/renderer');

export default defineConfig({
  root,
  base: './', // packaged app loads via file:// — relative asset paths required
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Reuse the proven data layer + player from the website.
      '@app': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3005', changeOrigin: true },
      '/proxy': { target: 'http://localhost:3005', changeOrigin: true },
      '/image-proxy': { target: 'https://image.tmdb.org', changeOrigin: true, rewrite: (p) => p.replace(/^\/image-proxy/, '') },
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'desktop/dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
