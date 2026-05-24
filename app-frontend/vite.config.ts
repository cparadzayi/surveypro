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
      '/api': {
        target: process.env.VITE_API_BASE || 'http://127.0.0.1:3050',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
