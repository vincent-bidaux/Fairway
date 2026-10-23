import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` serves the SPA; API calls go to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
