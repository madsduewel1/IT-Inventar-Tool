import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/inventory/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/inventory/api': {
        target: 'http://127.0.0.1:3456',
        rewrite: (path) => path.replace(/^\/inventory/, '')
      },
      '/api': 'http://127.0.0.1:3456'
    }
  }
});
