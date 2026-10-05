import { defineConfig } from 'vitest/config';

// Client tests: store unit tests (node) + UI integration test (jsdom, asli server ke saath).
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false, // UI tests ek hi server share karte hain
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
    hookTimeout: 30000,
    environmentMatchGlobs: [['tests/**/*.ui.test.tsx', 'jsdom']],
    env: { VITE_SERVER_URL: 'http://127.0.0.1:4517' },
  },
});
