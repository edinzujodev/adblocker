import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The production build goes into the Go web package, which embeds it into
// adblocker.exe. During `npm run dev`, API calls go to a running server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: '../internal/web/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
})
