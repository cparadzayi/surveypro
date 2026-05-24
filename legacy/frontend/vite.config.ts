import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import type { UserConfig, ConfigEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      vue({
        script: {
          defineModel: true,
          propsDestructure: true
        }
      })
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3042',
          changeOrigin: true
        },
        '/auth': {
          target: 'http://localhost:3042',
          changeOrigin: true
        },
        '/computations': {
          target: 'http://localhost:3042',
          changeOrigin: true
        }
      }
    },
    define: {
      __APP_ENV__: env.APP_ENV
    }
  }
})
