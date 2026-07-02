import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
// TAURI_CREATOR:VITE_IMPORTS

export default defineConfig({
  plugins: [
    react(),
    // TAURI_CREATOR:VITE_PLUGINS
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // TAURI_CREATOR:VITE_CONFIG
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
