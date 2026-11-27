import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiPrefix } from '@unicore/shared';
import type { Env } from './config/env.js';

/** HTTP setup shared by main.ts and the tests, so both run the same app. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.setGlobalPrefix(apiPrefix);
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.enableShutdownHooks();
  return config;
}
