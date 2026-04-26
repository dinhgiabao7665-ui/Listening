import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // The repo name is 'Listening', so the base must match
  base: '/Listening/', 
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true
  },
  css: {
    transformer: 'postcss',
  }
});
