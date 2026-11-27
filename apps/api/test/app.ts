import type { Type } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Db } from '../src/db/database.js';

export interface TestAppOptions {
  /** Probe controllers that stand in for the routes of later stages. */
  controllers?: Type[];
  /** Replaces providers before the module compiles: the database, the logger params. */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export interface TestApp {
  app: NestExpressApplication;
  /** The app's own database: a fresh in-memory PGlite with the migrations applied. */
  db: Db;
  /** A supertest agent for the app: `http().get('/v1/health')`. */
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

/**
 * Builds the whole app the way main.ts does (AppModule and configureApp), without listening
 * on a port. Relies on the variables of vitest.config.e2e.ts: JWT_SECRET, an empty
 * DATABASE_URL and PGLITE_DIR=memory://, so every app gets a database of its own.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  const moduleRef = await (options.override?.(builder) ?? builder).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return {
    app,
    db: app.get<Db>(getDrizzleToken()),
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}
