import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Use './' instead of '/Listening/'. 
  // This tells the app to look in the EXACT folder it is currently in.
  base: './', 
  
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  css: {
    transformer: 'postcss',
  }
});

