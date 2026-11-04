import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const endpoint = env.VITE_MAKE_TEST_API_URL?.trim();
  if (endpoint) {
    let url: URL;
    try { url = new URL(endpoint, 'http://localhost'); } catch { throw new Error('VITE_MAKE_TEST_API_URL debe ser una URL válida de la API de Berry.'); }
    if (url.pathname !== '/api/integrations/make/test' || /(^|\.)make\.com$/i.test(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('VITE_MAKE_TEST_API_URL debe apuntar a la API de Berry, nunca al webhook de Make.');
  }
  return { plugins: [react()], server: { proxy: { '/api/integrations/make/test': { target: 'http://127.0.0.1:8787', changeOrigin: false } } } };
});
