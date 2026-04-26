import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const replicateToken = env.REPLICATE_API_TOKEN || ''

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        // Proxy /api/replicate/* -> https://api.replicate.com/v1/*
        // Server-side header injection keeps REPLICATE_API_TOKEN out of the
        // browser bundle. Production deployments need their own proxy.
        '/api/replicate': {
          target: 'https://api.replicate.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/replicate/, '/v1'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (replicateToken) {
                proxyReq.setHeader('Authorization', `Bearer ${replicateToken}`)
              }
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
      },
    },
  }
})
