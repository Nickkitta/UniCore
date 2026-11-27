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
      // Each app gets a fresh in-memory database with the migrations applied.
      PGLITE_DIR: 'memory://',
      DATABASE_URL: '',
      // Keeps the output clean; logging.e2e-spec.ts reads the log through its own stream.
      LOG_LEVEL: 'silent',
    },
  },
});
