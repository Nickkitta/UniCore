import type { LoggerService } from '@nestjs/common';
import { LogMailTransport, SmtpTransport } from '@nestjs/mail';
import { consoleMailFrom } from '../config/env.js';
import { consoleMailLogger, mailOptions } from './mail.options.js';

describe('mailOptions', () => {
  it('writes mail to the log by default, from a placeholder sender', () => {
    const options = mailOptions({ MAIL_TRANSPORT: 'console' });
    expect(options.transport).toBeInstanceOf(LogMailTransport);
    expect(options.from).toBe(consoleMailFrom);
    expect(
      mailOptions({ MAIL_TRANSPORT: 'console', MAIL_FROM: 'Dev <dev@example.com>' }).from,
    ).toBe('Dev <dev@example.com>');
  });

  it('sends through SMTP with the configured sender', () => {
    const options = mailOptions({
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtps://user:secret@smtp.example.com',
      MAIL_FROM: 'UniCore <no-reply@unicore.example>',
    });
    expect(options.transport).toBeInstanceOf(SmtpTransport);
    expect(options.from).toBe('UniCore <no-reply@unicore.example>');
  });

  it('refuses SMTP without its settings', () => {
    expect(() => mailOptions({ MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL and MAIL_FROM/);
  });
});

describe('consoleMailLogger', () => {
  it('raises the text of a mail from debug to log, where LOG_LEVEL=info shows it', () => {
    const inner = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const logger = consoleMailLogger(inner as unknown as LoggerService);
    logger.log('"Подтверди почту в UniCore" to anya@example.test');
    logger.debug?.('…/v1/auth/verify?token=abc');
    expect(inner.log.mock.calls).toEqual([
      ['"Подтверди почту в UniCore" to anya@example.test'],
      ['…/v1/auth/verify?token=abc'],
    ]);
    expect(inner.debug).not.toHaveBeenCalled();
  });
});
