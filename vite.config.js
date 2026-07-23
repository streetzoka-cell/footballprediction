import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'bundle-stats.html'
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/icon-192.png'],
      manifest: {
        name: 'ZokaScore',
        short_name: 'Zoka',
        description: 'Live Football Scores & Predictions',
        theme_color: '#05070a',
        background_color: '#05070a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // ★ FIX: Clean up old caches and take over immediately
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        
        // Only cache the app shell (static files), never API/Firestore
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        
        // ★ FIX: Explicitly tell Workbox to NEVER cache network/API requests
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly' 
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\//,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\//,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true,
    hmr: {
      overlay: false
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
            if (id.includes('lucide-react')) return 'ui-vendor';
            return 'vendor';
          }
        }
      },
    },
    chunkSizeWarningLimit: 1000,
  }
})