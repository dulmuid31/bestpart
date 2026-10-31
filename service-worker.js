/**
 * EXCEL TO PDF PWA — SERVICE WORKER ENGINE
 */

const CACHE_NAME = 'excel-to-pdf-v1.0.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/main.css',
  './assets/css/responsive.css',
  './assets/fonts/carlito/Carlito-Regular.ttf',
  './assets/fonts/carlito/Carlito-Bold.ttf',
  './lib/sheetjs/xlsx.full.min.js',
  './lib/pdflib/pdf-lib.min.js',
  './lib/pdfjs/pdf.min.js',
  './lib/pdfjs/pdf.worker.min.js',
  './lib/jszip/jszip.min.js',
  './js/file-manager.js',
  './js/workbook-manager.js',
  './js/pdf-stitcher.js',
  './js/conversion-manager.js',
  './js/database/storage-manager.js',
  './js/pdf-preview.js',
  './js/zip-manager.js',
  './js/app.js',
  './workers/conversion-worker.js',
  './engine/libreoffice-wasm/soffice.js',
  './engine/libreoffice-wasm/soffice.wasm',
  './engine/libreoffice-wasm/soffice.data'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching biner WASM dan aset UI Shell...');
      return cache.addAll(PRECACHE_ASSETS);
    }).catch((err) => {
      console.error('[ServiceWorker] Gagal mengunduh cache offline:', err);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] Menghapus cache versi lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      let response = cachedResponse;

      if (!response) {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          response = networkResponse;
        } catch (err) {
          console.warn('[ServiceWorker] Fetch offline error:', event.request.url);
        }
      }

      if (response && event.request.mode === 'navigate') {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }

      return response;
    })
  );
});