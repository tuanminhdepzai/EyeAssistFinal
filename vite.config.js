import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true
  },
  resolve: {
    alias: {
      'three': 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
      'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/'
    }
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      external: ['three']
    }
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh']
  }
});
