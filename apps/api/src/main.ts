import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
const config = configureApp(app);
await app.listen(config.get('PORT', { infer: true }));
