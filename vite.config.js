import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', threshold: 10240, deleteOriginFile: false }),
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 10240, deleteOriginFile: false }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'opensearch.xml', 'og-image.png', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'ZOKASCORE - Live Football Scores',
        short_name: 'ZOKASCORE',
        description: 'Live Football Scores, Fixtures, Results & AI Predictions',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#05070a',
        background_color: '#05070a',
        categories: ['sports', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: "Today's Fixtures", url: "/fixtures", description: "Today's football fixtures" },
          { name: "Live Scores", url: "/fixtures?live=true", description: "Live scores" },
          { name: "Predictions", url: "/predictions", description: "AI Predictions" },
          { name: "Premier League", url: "/league/39/premier-league", description: "Premier League table" }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/zokascore-sitemap\.xml/, /^\/sitemaps\//, /^\/robots\.txt/, /^\/opensearch\.xml/],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'gstatic-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } } },
          { urlPattern: /^https:\/\/api\.zokascore\.xyz\/.*/i, handler: 'NetworkFirst', options: { cacheName: 'api-cache', networkTimeoutSeconds: 5, expiration: { maxEntries: 100, maxAgeSeconds: 300 } } },
          { urlPattern: /\.(?:png|jpg|jpeg|svg|webp|ico)$/i, handler: 'CacheFirst', options: { cacheName: 'img-cache', expiration: { maxEntries: 100, maxAgeSeconds: 2592000 } } }
        ]
      }
    })
  ],
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'react-vendor';
            if (id.includes('firebase')) return 'firebase-vendor';
            return 'vendor';
          }
        }
      }
    }
  }
});