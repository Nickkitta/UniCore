import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';

/** The database the services work with: Postgres or PGlite, the same API for both. */
export type Db = PgAsyncDatabase<PgQueryResultHKT>;

/** The transaction `db.transaction()` passes to its callback; helpers of one scenario take it. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** SQL migrations made by drizzle-kit; the same path from src/db and from dist/db. */
export const migrationsFolder = path.join(import.meta.dirname, '../../drizzle');

export interface DatabaseConfig {
  /** Postgres; without it the database is PGlite in `pgliteDir`. */
  databaseUrl?: string;
  /** Relative to the working directory; `memory://` keeps the data in memory. */
  pgliteDir: string;
}

export interface OpenedDatabase {
  db: Db;
  /** For the startup log; never contains a password. */
  description: string;
}

/**
 * Opens the database and applies the migrations it lacks, so the server, the tests and
 * production always run on the current schema. PGlite allows a single process, which is
 * why the server migrates by itself instead of waiting for `db:migrate`.
 */
export async function openDatabase(config: DatabaseConfig): Promise<OpenedDatabase> {
  if (config.databaseUrl) {
    // Without a timeout a query waits forever for an unreachable server.
    const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 3000 });
    const db = drizzlePostgres({ client: pool });
    await closeOnFailure(
      () => migratePostgres(db, { migrationsFolder }),
      () => pool.end(),
    );
    return { db, description: `Postgres at ${new URL(config.databaseUrl).host}` };
  }

  const dataDir = config.pgliteDir.startsWith('memory://')
    ? config.pgliteDir
    : preparePgliteDir(config.pgliteDir);
  const client = await PGlite.create(dataDir);
  const db = drizzlePglite({ client });
  await closeOnFailure(
    () => migratePglite(db, { migrationsFolder }),
    () => client.close(),
  );
  return { db, description: `PGlite in ${dataDir}` };
}

/** Number of migrations recorded in the database; drizzle-kit and the server share the table. */
export async function countAppliedMigrations(db: Db) {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    'objects',
  );
  return result[0]?.count ?? 0;
}

/**
 * Resolves the PGlite directory and creates its parent: PGlite creates only the last
 * folder of the path. drizzle.config.ts does the same for drizzle-kit.
 */
export function preparePgliteDir(dir: string) {
  const dataDir = path.resolve(dir);
  mkdirSync(path.dirname(dataDir), { recursive: true });
  return dataDir;
}

async function closeOnFailure(run: () => Promise<unknown>, close: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
}
