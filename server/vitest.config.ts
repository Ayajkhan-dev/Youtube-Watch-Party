import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-test-secret-123456',
      CLIENT_URL: 'http://localhost:5173',
    },
  },
});
