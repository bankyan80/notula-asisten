/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import type { ServerOptions as HttpsServerOptions } from 'node:https';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * HTTPS untuk pengujian dari HP (WAJIB untuk microphone).
 *
 * `getUserMedia` hanya ada di secure context; `http://<ip-lan>:4173` bukan
 * secure context sehingga `navigator.mediaDevices` = undefined. Nyalakan dengan
 * `NOTULA_HTTPS=1` (script `npm run preview:https` / `npm run dev:https`)
 * setelah sertifikat dibuat lewat `npm run certs` — lihat docs/DEV-HTTPS.md.
 */
function tlsOptions(): HttpsServerOptions {
  const certPath = resolve(process.cwd(), 'certs/dev.pem');
  const keyPath = resolve(process.cwd(), 'certs/dev-key.pem');
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    throw new Error('Sertifikat HTTPS belum ada. Jalankan dulu: npm run certs');
  }
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

const httpsOn = process.env.NOTULA_HTTPS === '1';
const https: HttpsServerOptions | undefined = httpsOn ? tlsOptions() : undefined;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Notula Assistent',
        short_name: 'Notula',
        description: 'Asisten cerdas untuk setiap rapat. Rekam. Transkrip. Rangkum.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0757A8',
        background_color: '#F8FBFF',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Batch 06: WASM onnxruntime (~26 MB) TIDAK masuk precache (unduhan
        // pertama saat transkripsi pertama), tapi disimpan di Cache Storage
        // supaya transkripsi berikutnya bisa jalan offline.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'notula-wasm',
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
    restoreMocks: true,
  },
  // Bundle satu berkas (React + Dexie + router) ≈ 154 kB gzip — aman untuk PWA
  // yang sudah di-precache. Code-splitting route dikerjakan di Batch 14 bila perlu.
  build: {
    chunkSizeWarningLimit: 600,
  },
  // Worker transkripsi (Batch 06) memakai dynamic import @huggingface/transformers
  // → butuh format ES module agar bisa di-code-split terpisah dari main bundle.
  worker: {
    format: 'es',
  },
  // `host: true` supaya HP di LAN yang sama bisa membuka alamat ini
  // (default hanya 127.0.0.1 → HP tidak akan bisa terhubung).
  server: {
    host: true,
    port: 5173,
    https,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    https,
  },
});
