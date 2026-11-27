import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleModule } from '@nestjs/drizzle';
import type { Env } from '../config/env.js';
import { countAppliedMigrations, openDatabase } from './database.js';

/**
 * Registers the database for the whole app; services take it with `@InjectDrizzle()`.
 * The factory runs once per app, so each app (and each test) gets its own client,
 * and DrizzleModule closes that client on shutdown.
 */
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService<Env, true>) => {
        const { db, description } = await openDatabase({
          databaseUrl: config.get('DATABASE_URL', { infer: true }),
          pgliteDir: config.get('PGLITE_DIR', { infer: true }),
        });
        const migrations = await countAppliedMigrations(db);
        new Logger('Database').log(`${description}, migrations in the database: ${migrations}`);
        return { db };
      },
    }),
  ],
})
export class DatabaseModule {}
