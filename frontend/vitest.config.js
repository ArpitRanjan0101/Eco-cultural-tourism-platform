import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const src = (path) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': src(''),
      // The real package throws outside the React server build; tests import server modules directly.
      'server-only': src('tests/stubs/server-only.js'),
      // next/font only works inside the Next compiler.
      'next/font/google': src('tests/stubs/next-font.js'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['src/tests/e2e/**', 'node_modules/**'],
  },
});
