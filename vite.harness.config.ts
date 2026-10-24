import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { outDir: 'dist-b', emptyOutDir: true, rollupOptions: { input: { main: 'index.html', harness: 'harness-b.html' } } } });
