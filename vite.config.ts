import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Landing page (fikoai.de) — served at "/"
        main: path.resolve(__dirname, 'index.html'),
        // Muhasebe / login uygulaması — served at "/app" (see vercel.json rewrite)
        app: path.resolve(__dirname, 'muhasebe-app.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
