import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import viteCompression from 'vite-plugin-compression'; 

export default defineConfig({
  plugins: [
    react(),
    
    // ★ REMOVED vite-plugin-prerender: It has a known ESM bug (require is not defined) 
    // that crashes Vite builds in "type": "module" projects. 
    // Your Vercel SSR function (api/ssr.js) already handles the critical SEO rendering 
    // for /match/, /team/, and /league/ pages!

    // ★ CORE WEB VITALS: Brotli Compression (Reduces JS/CSS payload by ~70%)
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024, 
      deleteOriginFile: false
    }),
    
    // ★ CORE WEB VITALS: Gzip Fallback for older CDNs
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
      deleteOriginFile: false
    }),

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/?source=pwa', 
        name: 'ZOKASCORE', 
        short_name: 'ZOKASCORE',
        description: 'Live Football Scores, Fixtures and Predictions',
        start_url: '/', 
        scope: '/', 
        display: 'standalone',
        theme_color: '#0a0d14', 
        background_color: '#0a0d14',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        skipWaiting: true, 
        clientsClaim: true, 
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [
          /^\/robots\.txt$/, 
          /^\/ads\.txt$/, 
          /^\/zokascore-sitemap\.xml/, 
          /^\/sitemap\.xml/,
          /^\/sitemap\//, 
          /^\/api\/.*/, 
          /^\/opensearch\.xml$/, 
          /^\/google.*/
        ],
        runtimeCaching: [
          { 
            urlPattern: ({ url }) => url.origin === self.location.origin && (url.pathname === '/' || url.pathname.endsWith('.html')), 
            handler: 'NetworkFirst', 
            options: { cacheName: 'html-cache', networkTimeoutSeconds: 3 } 
          },
          { 
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, 
            handler: 'CacheFirst', 
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } } 
          },
          { urlPattern: /^https:\/\/api\.zokascore\.xyz\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^\/api\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/.*\.googlesyndication\.com\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/.*\.doubleclick\.net\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/.*\.adtrafficquality\.google\/.*/i, handler: 'NetworkOnly' },
          { 
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2)$/i, 
            handler: 'CacheFirst', 
            options: { cacheName: 'assets-cache', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } } 
          }
        ]
      }
    })
  ],

  server: {
    port: 5173,
    proxy: { 
      '/api': { target: 'http://localhost:3099', changeOrigin: true, secure: false } 
    }
  },

  build: {
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true, 
    assetsInlineLimit: 4096, 
    esbuild: { drop: ['console', 'debugger'] },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'react-vendor';
          if (id.includes('firebase')) return 'firebase-vendor';
          if (id.includes('lucide-react')) return 'icons-vendor'; 
          if (id.includes('framer-motion')) return 'animation-vendor';
          if (id.includes('@tanstack')) return 'query-vendor';
          if (id.includes('axios')) return 'network-vendor';
        }
      }
    }
  }
});