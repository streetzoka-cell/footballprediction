import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'icons/icon-192.png',
        'icons/icon-512.png'
      ],

      manifest: {
        name: 'ZOKASCORE',
        short_name: 'ZOKASCORE',
        description: 'Live Football Scores, Fixtures and Predictions',
        theme_color: '#0a0d14',
        background_color: '#0a0d14',
        display: 'standalone',
        start_url: '/',
        id: '/?source=pwa',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },

      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true, // ★ FIX 1: Force clean old caches on new deploy
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        navigateFallbackDenylist: [
          /^\/robots\.txt$/,
          /^\/zokascore-sitemap\.xml$/,
          /^\/sitemap\.xml$/,
          /^\/sitemap-index\.xml$/,
          /^\/api\/.*/, 
          /^\/opensearch\.xml$/
        ],

        runtimeCaching: [
          {
            // ★ FIX 2: Always fetch HTML from network first to prevent stale UI
            urlPattern: ({ url }) => url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('.html')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^https:\/\/api\.zokascore\.xyz\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheableResponse: { statuses: [] } 
            }
          },
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheableResponse: { statuses: [] }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheableResponse: { statuses: [] }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'assets-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3099',
        changeOrigin: true,
        secure: false
      }
    }
  },

  build: {
    chunkSizeWarningLimit: 1000,
    esbuild: {
      drop: ['console', 'debugger'],
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('react-router-dom')
            ) {
              return 'react-vendor';
            }
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            if (
              id.includes('lucide-react') ||
              id.includes('framer-motion')
            ) {
              return 'ui-vendor';
            }
            if (id.includes('@tanstack')) {
              return 'query-vendor';
            }
          }
        }
      }
    }
  }
});