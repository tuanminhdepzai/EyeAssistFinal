import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true
  },
  esbuild: {
    // Tự động xóa sạch toàn bộ console.* và debugger khi build production (chống lộ log)
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none'
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: false, // Tuyệt đối không xuất file source map để giấu cấu trúc src/
    minify: 'esbuild',
    rollupOptions: {
      output: {
        compact: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['@mediapipe/face_mesh']
  }
}));

