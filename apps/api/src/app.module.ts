import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from '@nestjs/mail';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { loggerParams } from './common/logger.params.js';
import { type Env, envSchema } from './config/env.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthModule } from './health/health.module.js';
import { mailOptions } from './mail/mail.options.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      // Tests get their variables from the Vitest config, never from a developer's .env.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        loggerParams(config.get('LOG_LEVEL', { infer: true })),
    }),
    // Global: Mailer for any module. Tests replace MailTransport with InMemoryMailTransport.
    MailModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        mailOptions({
          MAIL_TRANSPORT: config.get('MAIL_TRANSPORT', { infer: true }),
          SMTP_URL: config.get('SMTP_URL', { infer: true }),
          MAIL_FROM: config.get('MAIL_FROM', { infer: true }),
        }),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
