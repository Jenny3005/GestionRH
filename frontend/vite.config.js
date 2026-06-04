// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    hmr: {
      // Important : s'assurer que HMR est activé
      overlay: true,
      protocol: 'ws',
      host: 'localhost',
      port: 5173
    },
    watch: {
      // Pour Windows, ça aide souvent
      usePolling: true,
      interval: 100
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  // Optimisations pour le HMR
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
})