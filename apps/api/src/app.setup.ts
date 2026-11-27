import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiPrefix } from '@unicore/shared';
import { Logger } from 'nestjs-pino';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { InputValidationPipe } from './common/input-validation.pipe.js';
import type { Env } from './config/env.js';

/** HTTP setup shared by main.ts and the tests, so both run the same app. */
export function configureApp(app: NestExpressApplication) {
  // Nest's own messages go to pino too, as JSON lines with the request id.
  app.useLogger(app.get(Logger));
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.setGlobalPrefix(apiPrefix);
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  // Request schemas from @unicore/shared: 422 UNICORE_INVALID_INPUT instead of Nest's 400.
  app.useGlobalPipes(new InputValidationPipe());
  // Every error, unknown routes included, as { error: { code, message } }.
  app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
  return config;
}
