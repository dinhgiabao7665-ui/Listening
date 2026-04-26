import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Change this from '/Listening/' to just '/'
  base: '/', 
  plugins: [react()],
  build: {
    outDir: 'dist',
  }
});
