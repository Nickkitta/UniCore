import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The app never reads a developer's .env in tests (see app.module.ts).
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
    },
  },
});
