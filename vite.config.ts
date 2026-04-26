import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // CRITICAL: This is the exact path for your GitHub repository
  base: '/Listening/', 
  
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true, // Cleans the folder before building
    chunkSizeWarningLimit: 1500, // Hides annoying size warnings
  },

  server: {
    host: true
  },

  // Keeps your 32-bit phone happy while the 64-bit Mac builds it
  css: {
    transformer: 'postcss',
  }
});
