import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Set base according to env: '/' for dev, '/Listening/' for prod (GitHub Pages)
const base = process.env.NODE_ENV === 'production' ? '/Listening/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
  },
  // No css.transformer option: Vite automatically uses PostCSS if configured.
});