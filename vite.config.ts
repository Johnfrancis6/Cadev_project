import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // No inline <script> or modulepreload polyfill: the CSP only allows same-origin script files.
    modulePreload: { polyfill: false },
  },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts', 'scripts/**/*.test.{ts,js,mjs}'],
  },
});
