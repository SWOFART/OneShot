import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/recovery/',
  build: {
    outDir: '../../apps/web/dist/recovery',
    emptyOutDir: true,
  },
});
