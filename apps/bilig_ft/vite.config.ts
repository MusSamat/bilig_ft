import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Monorepo: import shared packages from source (no build step) via aliases.
export default defineConfig({
  resolve: {
    alias: {
      '@bilig/permissions': pkg('../../packages/permissions/src/index.ts'),
      '@bilig/content-model': pkg('../../packages/content-model/src/index.ts'),
      '@bilig/content-model/schema': pkg('../../packages/content-model/src/schema.ts'),
      '@bilig/scene-core': pkg('../../packages/scene-core/src/index.ts'),
      '@': pkg('./src'),
    },
  },
  server: { port: 5173 },
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
