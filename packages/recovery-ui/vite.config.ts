import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { RECOVERY_MOCK_SERVER_VERSION } from './src/contract.js';
import { handleRecoveryMockRequest } from './src/mock-server.js';

function recoveryMockPlugin(): Plugin {
  return {
    name: 'oneshot-recovery-mock-v1',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const result = handleRecoveryMockRequest(request.url ?? '/', request.method ?? 'GET');
        if (result === null) {
          next();
          return;
        }
        response.statusCode = result.status;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('x-oneshot-mock-version', RECOVERY_MOCK_SERVER_VERSION);
        response.end(JSON.stringify(result.body));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), recoveryMockPlugin()],
  resolve: {
    alias: {
      '@oneshot/brand/tokens.css': fileURLToPath(
        new URL('../brand/src/tokens.css', import.meta.url),
      ),
    },
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'recovery-ui',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
