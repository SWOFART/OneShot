import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@oneshot/recovery-ui': `${workspaceRoot}/packages/recovery-ui/src/index.ts`,
      '@oneshot/settlement-ui': `${workspaceRoot}/packages/settlement-ui/src/index.ts`,
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
