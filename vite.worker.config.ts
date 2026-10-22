import { defineConfig } from 'vite';

// MediaPipe's WASM loader calls importScripts, which requires a classic Worker.
export default defineConfig({
  publicDir: false,
  build: {
    target: 'es2022', outDir: 'public/vendor', emptyOutDir: false,
    lib: { entry: 'src/tracking/face.worker.ts', name: 'FaceWorker', formats: ['iife'], fileName: () => 'face-worker.js' },
  },
});
