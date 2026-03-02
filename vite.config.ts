import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // ⚠ GÜVENLİK: API anahtarları artık bundle'a GÖMÜLMEMEKTEDİR.
    // Gemini API anahtarı YALNIZCA Supabase Edge Function sunucu tarafında kullanılır.
    // İstemci tarafında doğrudan Gemini çağrısı artık desteklenmez.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});

