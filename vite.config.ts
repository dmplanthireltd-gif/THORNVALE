import { defineConfig } from 'vite';

export default defineConfig({
  // The server serves the game under /play/ and the marketing website at the root (BIBLE §4).
  base: '/play/',
  server: { port: 5173, open: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
