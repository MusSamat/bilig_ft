import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Monorepo: import shared packages from source (no build step) via aliases.
export default defineConfig({
  resolve: {
    // Order matters: specific subpaths before the package root, else the root
    // alias greedily swallows subpath imports.
    alias: [
      {
        find: '@bilig/content-model/fixtures/animal-cell',
        replacement: pkg('../../packages/content-model/src/fixtures/animal-cell.ts'),
      },
      {
        find: '@bilig/content-model/schema',
        replacement: pkg('../../packages/content-model/src/schema.ts'),
      },
      {
        find: '@bilig/content-model',
        replacement: pkg('../../packages/content-model/src/index.ts'),
      },
      { find: '@bilig/permissions', replacement: pkg('../../packages/permissions/src/index.ts') },
      { find: '@bilig/scene-core', replacement: pkg('../../packages/scene-core/src/index.ts') },
      { find: '@', replacement: pkg('./src') },
    ],
  },
  server: {
    port: 5173,
    // Dev: proxy API calls to bilig_back (CORS-free during development).
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Offline-first: the app shell + cached topic packages work without network
      // after first load (TZ: "PWA: тема работает без сети после скачивания").
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,webp,png,svg,glb,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // Topic content packages — cache-first so a downloaded topic is offline.
            urlPattern: /\/api\/(catalog|packages)\b/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'bilig-content' },
          },
          {
            urlPattern: /\/(models|previews)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bilig-assets',
              expiration: { maxEntries: 200 },
            },
          },
        ],
      },
      manifest: {
        name: 'Bilig',
        short_name: 'Bilig',
        description: 'Интерактивные 3D-темы по STEM для школ Кыргызстана',
        lang: 'ky',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
});
