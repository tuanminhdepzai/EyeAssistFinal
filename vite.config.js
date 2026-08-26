import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh']
  }
});

