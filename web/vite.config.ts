import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    rollupOptions: {
      output: {
        // Le worker de pdf.js est un module .mjs : renommé en .js, que nginx sert avec le bon type
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
  server: {
    // API sur le port 3000 en local ; dans Docker, VITE_API_TARGET=http://api:3000
    // changeOrigin: false garde le Host du navigateur, que l'API compare à Origin (protection CSRF)
    // xfwd transmet l'IP du navigateur, comme nginx en production
    proxy: { '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:3000', changeOrigin: false, xfwd: true } },
  },
})
