import { Logger, type LoggerService } from '@nestjs/common';
import { LogMailTransport, type MailModuleOptions, SmtpTransport } from '@nestjs/mail';
import { consoleMailFrom, type Env } from '../config/env.js';

/**
 * The logger of the console transport. LogMailTransport writes the subject at `log` level and
 * the text of the mail, where the confirmation link is, at `debug`; the server logs from
 * `info` up, so the text goes out at `log` level too.
 */
export function consoleMailLogger(logger: LoggerService = new Logger('Mail')): LoggerService {
  return {
    log: (message: unknown) => logger.log(message),
    debug: (message: unknown) => logger.log(message),
    warn: (message: unknown) => logger.warn(message),
    error: (message: unknown) => logger.error(message),
  };
}

/**
 * MailModule options from the environment: SMTP in production, the log in development.
 * The module checks the sender at startup, so a malformed MAIL_FROM stops the server there.
 */
export function mailOptions(
  env: Pick<Env, 'MAIL_TRANSPORT' | 'SMTP_URL' | 'MAIL_FROM'>,
): MailModuleOptions {
  if (env.MAIL_TRANSPORT === 'smtp') {
    // envSchema already requires both with smtp; the check is for the types.
    if (!env.SMTP_URL || !env.MAIL_FROM) {
      throw new Error('MAIL_TRANSPORT=smtp needs SMTP_URL and MAIL_FROM');
    }
    return { transport: new SmtpTransport({ url: env.SMTP_URL }), from: env.MAIL_FROM };
  }
  return {
    transport: new LogMailTransport({ logger: consoleMailLogger() }),
    from: env.MAIL_FROM ?? consoleMailFrom,
  };
}
