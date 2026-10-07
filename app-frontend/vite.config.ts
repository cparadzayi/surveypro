import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['maplibre-gl'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue ecosystem — loaded on every page
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          // Heavy map libraries — only needed in map views
          'vendor-maps': ['leaflet', 'maplibre-gl'],
          // Geo utilities — shared across cadastral modules
          'vendor-geo': [
            'proj4',
            '@turf/area',
            '@turf/boolean-contains',
            '@turf/boolean-overlap',
            '@turf/helpers',
            '@turf/intersect',
          ],
          // HTTP client
          'vendor-http': ['axios'],
        },
      },
    },
  },
  server: {
    host: true, // Expose to network for mobile testing
    port: 5173,
    proxy: {
      // Target is the backend's SERVER ROOT (no /api): Vite prepends the
      // incoming /api path itself, so a target ending in /api would turn
      // /api/parcels into /api/api/parcels.
      //
      // This deliberately does NOT read VITE_API_BASE. That variable is the
      // client's baseURL and is documented as INCLUDING /api, so the two
      // meanings collided: setting VITE_API_BASE=/api (as .env.example
      // instructed for dev) made this an invalid target and broke the proxy.
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3050',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
