import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.BUILD_VERSION || pkg.version),
    __EE__: JSON.stringify(process.env.BUILD_EDITION === 'cloud'),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'OpenBin',
        short_name: 'OpenBin',
        description: 'Inventory with intelligence. Organize physical storage with QR codes and photo recognition.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        // Disable the default precache-based navigateFallback.
        // iOS aggressively evicts Cache Storage for PWAs after idle periods;
        // if the precached index.html is gone the SW serves a blank page.
        // Use NetworkFirst via runtimeCaching instead — fetches from the server
        // first, falling back to cache only when offline.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) =>
              request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:1453',
        changeOrigin: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: (id) =>
                id.includes('node_modules/react-dom') ||
                id.includes('node_modules/react/') ||
                id.includes('node_modules/react-router'),
              priority: 4,
            },
            { name: 'vendor-scanner', test: (id) => id.includes('node_modules/html5-qrcode'), priority: 3 },
            { name: 'vendor-qrcode', test: (id) => id.includes('node_modules/qrcode'), priority: 2 },
            { name: 'vendor-icons', test: (id) => id.includes('node_modules/lucide-react'), priority: 1 },
          ],
        },
      },
    },
  },
})
