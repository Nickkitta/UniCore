import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

// The startup messages wait for the pino logger that configureApp installs.
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
const config = configureApp(app);
await app.listen(config.get('PORT', { infer: true }));
