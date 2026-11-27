import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('app', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the health check under /v1', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(200, { ok: true });
  });

  // Express answers it with its own 404: Nest mounts its not-found handler, and with it the
  // contract format, under the global prefix only (errors.e2e-spec.ts checks /v1/nope).
  it('has no routes outside /v1', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('allows CORS from the configured origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/health')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'GET');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('does not allow CORS from other origins', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
