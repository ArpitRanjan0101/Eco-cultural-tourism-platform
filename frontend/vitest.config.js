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
    // Test-only server configuration (no real secret; the backend is a fake, src/tests/bff/fakeBackend.js).
    env: {
      BACKEND_INTERNAL_URL: 'http://backend.test:8081',
      INTERNAL_SERVICE_TOKEN: 'test-service-token-0123456789abcdef',
      APP_ORIGIN: 'http://localhost:3000',
      TRUSTED_PROXY_HOPS: '1',
      SESSION_COOKIE_SECURE: 'false',
    },
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['src/tests/e2e/**', 'node_modules/**'],
  },
});
