import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      // Tests get their variables from the Vitest config, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    HealthModule,
  ],
})
export class AppModule {}
