import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { aliases } from './config/aliases';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** UI languages = locale folders (TZ W-01: «новый язык = новые файлы локалей»). */
const LANGS = readdirSync(root('./src/locales'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const DEFAULT_LANG = 'ky';

const appStrings = (lang: string): { title: string; tagline: string; description: string } =>
  JSON.parse(readFileSync(root(`./src/locales/${lang}/app.json`), 'utf8'));

/**
 * Per-language entry documents: `/<lang>/index.html` with the right
 * `<html lang>`, title and description (the web server serves `/<lang>/*`
 * from it; the root index.html is Kyrgyz).
 */
function localizedEntries(): Plugin {
  const swap = (html: string, lang: string) => {
    const s = appStrings(lang);
    return html
      .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${s.title} — ${s.tagline}</title>`)
      .replace(/(<meta name="description" content=")[^"]*"/, `$1${s.description}"`);
  };
  return {
    name: 'bilig-localized-entries',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => swap(html, DEFAULT_LANG),
    },
    writeBundle(opts) {
      const out = opts.dir ?? root('./dist');
      const html = readFileSync(join(out, 'index.html'), 'utf8');
      for (const lang of LANGS) {
        mkdirSync(join(out, lang), { recursive: true });
        writeFileSync(join(out, lang, 'index.html'), swap(html, lang));
      }
    },
  };
}

/** KTX2 transcoder for compressed textures (plugin-gltf), served next to the app. */
function basisTranscoder(): Plugin {
  const src = root('./node_modules/three/examples/jsm/libs/basis');
  const files = ['basis_transcoder.js', 'basis_transcoder.wasm'];
  return {
    name: 'bilig-basis-transcoder',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = files.find((n) => req.url === `/basis/${n}`);
        if (!f) return next();
        res.setHeader('Content-Type', f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(join(src, f)));
      });
    },
    writeBundle(opts) {
      const out = join(opts.dir ?? root('./dist'), 'basis');
      mkdirSync(out, { recursive: true });
      for (const f of files) copyFileSync(join(src, f), join(out, f));
    },
  };
}

/** Dev only: serve MSW's worker so `VITE_MOCK=1 npm run dev` works without the backend. */
function devMockWorker(): Plugin {
  return {
    name: 'bilig-dev-msw-worker',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/mockServiceWorker.js') return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Service-Worker-Allowed', '/');
        res.end(readFileSync(root('./node_modules/msw/lib/mockServiceWorker.js')));
      });
    },
  };
}

export default defineConfig({
  resolve: { alias: aliases },
  server: {
    port: 5173,
    // Dev: proxy API calls to bilig_back (CORS-free during development).
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    target: 'es2022',
    // three / r3f / drei, the plugins, pptxgenjs and jsPDF are lazy chunks (§10: initial JS ≤ 250 KB gzip).
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    react(),
    devMockWorker(),
    basisTranscoder(),
    localizedEntries(),
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
