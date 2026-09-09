import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@oneshot/recovery-ui/styles.css': fileURLToPath(
        new URL('../../packages/recovery-ui/src/styles.css', import.meta.url),
      ),
      '@oneshot/settlement-ui/styles.css': fileURLToPath(
        new URL('../../packages/settlement-ui/src/styles.css', import.meta.url),
      ),
      '@oneshot/recovery-ui': fileURLToPath(
        new URL('../../packages/recovery-ui/src/index.ts', import.meta.url),
      ),
      '@oneshot/settlement-ui': fileURLToPath(
        new URL('../../packages/settlement-ui/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    outDir: 'dist',
  },
});
