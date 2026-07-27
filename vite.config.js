import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

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
      injectRegister: false,
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
        ],
        shortcuts: [
          {
            name: 'Live Fixtures',
            short_name: 'Fixtures',
            description: "View today's football fixtures",
            url: '/fixtures',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Make Predictions',
            short_name: 'Predict',
            description: "Predict today's matches",
            url: '/predictions',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'Leaderboard',
            short_name: 'Ranks',
            description: 'View the daily leaderboard',
            url: '/leaderboard',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
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
  // ★ FIX: Tell Vite to ignore backend packages so it doesn't crash the frontend
  optimizeDeps: {
    exclude: ['firebase-admin']
  },
 // vite.config.js
  server: {
    port: 5173,
    host: true,
    hmr: { overlay: false },
    proxy: {
      '/api': {
        target: 'http://localhost:3099',
        changeOrigin: true,
      }
    }
  },

  
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('@tanstack')) return 'tanstack-vendor';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
            if (id.includes('framer-motion')) return 'animation-vendor';
            if (id.includes('lucide-react')) return 'ui-vendor';
            if (id.includes('@ffmpeg') || id.includes('@mediapipe') || id.includes('konva')) return 'studio-vendor';
            return 'vendor';
          }
        }
      },
    },
    chunkSizeWarningLimit: 1000,
  }
})