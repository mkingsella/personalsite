// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public', // Tells Vite to use /public as the source directory
  build: {
    outDir: '../dist', // Outputs the built site to /dist
    emptyOutDir: true
  }
});
