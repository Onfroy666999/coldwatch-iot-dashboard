import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'ColdWatch',
        short_name: 'ColdWatch',
        description: 'IoT cold chain monitoring for perishable goods',
        theme_color: '#0984E3',
        background_color: '#F8FAFC',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2}'],
        globIgnores: ['**/slide1*', '**/slide2*', '**/slide3*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],

  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],

  build: {
    // Suppress the warning now that chunks are properly split
    chunkSizeWarningLimit: 500,

    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── React core ────────────────────────────────────────────────────
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) return 'vendor-react';

          // ── Animation library (used on every page) ────────────────────────
          if (
            id.includes('node_modules/framer-motion') ||
            id.includes('node_modules/motion')
          ) return 'vendor-motion';

          // ── Recharts + D3 (Dashboard and History only) ────────────────────
          // Isolated so users who only visit Alerts never download chart code
          if (
            id.includes('node_modules/recharts') ||
            id.includes('node_modules/d3-') ||
            id.includes('node_modules/victory-vendor')
          ) return 'vendor-charts';

          // ── Lucide icons (large, shared everywhere) ───────────────────────
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';

          // ── shadcn/ui component library ───────────────────────────────────
          if (id.includes('/components/ui/')) return 'vendor-ui';

          // ── All other node_modules ────────────────────────────────────────
          if (id.includes('node_modules/')) return 'vendor-misc';

          // ── Page-level chunks ─────────────────────────────────────────────
          if (id.includes('/pages/Dashboard'))    return 'page-dashboard';
          if (id.includes('/pages/Alerts'))       return 'page-alerts';
          if (id.includes('/pages/History'))      return 'page-history';
          if (id.includes('/pages/Devices'))      return 'page-devices';
          if (id.includes('/pages/Settings'))     return 'page-settings';
          if (
            id.includes('/pages/Login') ||
            id.includes('/pages/SetupSurvey') ||
            id.includes('/pages/Onboarding') ||
            id.includes('/pages/SplashScreen')
          ) return 'page-auth';

          // ── AIAssistant — heaviest component, loaded on demand ────────────
          if (id.includes('/components/AIAssistant')) return 'component-ai';

          // ProduceModeSelector is shared — Rollup places it in the common chunk automatically
        },
      },
    },
  },

  server: {
    host: true,
    port: 5173,
  },
})
