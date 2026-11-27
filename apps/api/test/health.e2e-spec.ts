import { Logger } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { createTestApp, type TestApp } from './app.js';

describe('health with the database down', () => {
  let t: TestApp;

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    t = await createTestApp({
      override: (builder) =>
        builder
          .overrideProvider(getDrizzleToken())
          .useValue({ execute: () => Promise.reject(new Error('connect ECONNREFUSED')) }),
    });
  });

  afterAll(async () => {
    await t.close();
    vi.restoreAllMocks();
  });

  it('answers 503 with ok: false', async () => {
    await t.http().get('/v1/health').expect(503, { ok: false });
  });
});
