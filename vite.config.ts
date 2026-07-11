import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only: /app, /giris, /login → muhasebe-app.html
// (canlıda bunu vercel.json rewrites yapıyor; yerel dev sunucusunda karşılığı budur)
const appRouteRewrite: Plugin = {
  name: 'app-route-rewrite',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = (req.url || '').split('?')[0];
      if (url === '/app' || url === '/giris' || url === '/login') {
        req.url = '/muhasebe-app.html';
      }
      next();
    });
  },
};

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  plugins: [react(), appRouteRewrite],
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
