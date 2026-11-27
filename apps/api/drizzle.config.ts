import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from apps/api (npm -w apps/api run db:*) and reads the same .env as the server.
if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env.DATABASE_URL || undefined;
const pgliteDir = process.env.PGLITE_DIR || '.local/pgdata';
const common = { dialect: 'postgresql', schema: './src/db/schema.ts', out: './drizzle' } as const;

// PGlite creates only the last folder of the path (see preparePgliteDir in src/db/database.ts).
if (!databaseUrl && !pgliteDir.startsWith('memory://')) {
  mkdirSync(path.dirname(path.resolve(pgliteDir)), { recursive: true });
}

export default databaseUrl
  ? defineConfig({ ...common, dbCredentials: { url: databaseUrl } })
  : // PGlite allows one process at a time: stop the server before `db:migrate`.
    defineConfig({ ...common, driver: 'pglite', dbCredentials: { url: pgliteDir } });
