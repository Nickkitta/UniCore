import { defineConfig } from 'vitest/config';
// Legacy Supabase checks (SQL migrations on PGlite and the seeder) until stage 9 of docs/backend-migration.md
export default defineConfig({
  test: { include: ['tests/**/*.test.{ts,mjs}'], environment: 'node' },
});
