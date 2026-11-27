import { PGlite } from '@electric-sql/pglite';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Mailer, MailSendOptions, MailSendResult } from '@nestjs/mail';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createUser } from '../../test/users.js';
import type { Env } from '../config/env.js';
import { type Db, migrationsFolder } from '../db/database.js';
import { emailTokens, users } from '../db/schema.js';
import {
  EmailVerificationService,
  hashEmailToken,
  verificationLinkTtlMs,
} from './email-verification.service.js';

let client: PGlite;
let db: Db;
let service: EmailVerificationService;
const send = vi.fn<(options: MailSendOptions) => Promise<MailSendResult>>();

// The service on its own, without Nest: an in-memory PGlite and a stand-in Mailer.
beforeAll(async () => {
  client = await PGlite.create();
  const pglite = drizzle({ client });
  await migrate(pglite, { migrationsFolder });
  db = pglite;
  const config = new ConfigService<Env, true>({ PUBLIC_BASE_URL: 'https://api.unicore.example' });
  service = new EmailVerificationService(db, { send } as unknown as Mailer, config);
});

afterAll(async () => {
  await client.close();
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({} as MailSendResult);
});

const tokensOf = (userId: string) =>
  db.select().from(emailTokens).where(eq(emailTokens.userId, userId));

const verifiedAt = async (userId: string) =>
  (await db.select().from(users).where(eq(users.id, userId)))[0].emailVerifiedAt;

/** The token from the link in the n-th mail sent. */
function tokenFromMail(index = 0) {
  const text = send.mock.calls[index][0].text ?? '';
  const link = /https:\/\/\S+/.exec(text)?.[0] ?? '';
  return new URL(link).searchParams.get('token') ?? '';
}

describe('EmailVerificationService.issue', () => {
  it('stores only the hash of the token, valid for 24 hours', async () => {
    const user = await createUser(db, { verified: false });
    const now = new Date('2026-11-28T10:00:00Z');
    const token = await service.issue(db, user.id, now);
    expect(token).toMatch(/^[\w-]{43}$/);

    const [row] = await tokensOf(user.id);
    expect(row.tokenHash.equals(hashEmailToken(token))).toBe(true);
    expect(Object.values(row)).not.toContain(token);
    expect(row).toMatchObject({ purpose: 'verify_email', usedAt: null, createdAt: now });
    expect(row.expiresAt.getTime() - now.getTime()).toBe(verificationLinkTtlMs);
  });
});

describe('EmailVerificationService.sendLink', () => {
  it('mails the link built from PUBLIC_BASE_URL in text and HTML', () => {
    service.sendLink({ id: 'user-id', email: 'anya@example.test' }, 'the-token');
    expect(send).toHaveBeenCalledOnce();
    const mail = send.mock.calls[0][0];
    const link = 'https://api.unicore.example/v1/auth/verify?token=the-token';
    expect(mail).toMatchObject({ to: 'anya@example.test', subject: 'Подтверди почту в UniCore' });
    expect(mail.text).toContain(link);
    expect(String(mail.html)).toContain(`href="${link}"`);
  });

  it('logs a failed send with the user id but without the link, and never throws', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new Error('connection refused'));

    expect(() =>
      service.sendLink({ id: 'user-id', email: 'anya@example.test' }, 'secret-token'),
    ).not.toThrow();
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    const message = String(error.mock.calls[0][0]);
    expect(message).toContain('user-id');
    expect(message).toContain('connection refused');
    expect(message).not.toContain('secret-token');
    error.mockRestore();
  });
});

describe('EmailVerificationService.verify', () => {
  it('confirms the email once; the link then only says it is confirmed', async () => {
    const user = await createUser(db, { verified: false });
    const token = await service.issue(db, user.id);

    expect(await service.verify(token)).toBe('verified');
    const confirmedAt = await verifiedAt(user.id);
    expect(confirmedAt).toBeInstanceOf(Date);
    expect((await tokensOf(user.id))[0].usedAt).toBeInstanceOf(Date);

    expect(await service.verify(token)).toBe('already');
    expect(await verifiedAt(user.id)).toEqual(confirmedAt);
  });

  it('answers `already` to another link of a confirmed email', async () => {
    const user = await createUser(db, { verified: false });
    const first = await service.issue(db, user.id);
    const second = await service.issue(db, user.id);
    expect(await service.verify(first)).toBe('verified');
    expect(await service.verify(second)).toBe('already');
  });

  it('refuses a link older than 24 hours and leaves the email unconfirmed', async () => {
    const user = await createUser(db, { verified: false });
    const token = await service.issue(
      db,
      user.id,
      new Date(Date.now() - verificationLinkTtlMs - 1),
    );
    expect(await service.verify(token)).toBe('expired');
    expect(await verifiedAt(user.id)).toBeNull();
  });

  it('does not know a made-up token', async () => {
    expect(await service.verify('made-up')).toBe('invalid');
  });
});

describe('EmailVerificationService.resend', () => {
  it('does nothing for an unknown email', async () => {
    await service.resend('nobody@example.test');
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing for a confirmed email', async () => {
    const user = await createUser(db);
    await service.resend(user.email);
    expect(send).not.toHaveBeenCalled();
    expect(await tokensOf(user.id)).toEqual([]);
  });

  it('sends a working link to an unconfirmed email, whatever its case and spaces', async () => {
    const user = await createUser(db, { verified: false });
    await service.resend(` ${user.email.toUpperCase()} `);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].to).toBe(user.email);
    expect(await service.verify(tokenFromMail())).toBe('verified');
  });

  it('sends at most one email a minute', async () => {
    const user = await createUser(db, { verified: false });
    const start = Date.now();
    await service.resend(user.email, new Date(start));
    await service.resend(user.email, new Date(start + 59_000));
    expect(send).toHaveBeenCalledOnce();
    expect(await tokensOf(user.id)).toHaveLength(1);

    await service.resend(user.email, new Date(start + 61_000));
    expect(send).toHaveBeenCalledTimes(2);
    // The earlier link still works.
    expect(await service.verify(tokenFromMail(0))).toBe('verified');
  });

  it('lets only one of two parallel requests send', async () => {
    const user = await createUser(db, { verified: false });
    await Promise.all([service.resend(user.email), service.resend(user.email)]);
    expect(send).toHaveBeenCalledOnce();
    expect(await tokensOf(user.id)).toHaveLength(1);
  });
});
