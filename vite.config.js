import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VERCEL ? '/' : '/markdown-viewer/',
  build: {
    outDir: 'dist',
  },
});
