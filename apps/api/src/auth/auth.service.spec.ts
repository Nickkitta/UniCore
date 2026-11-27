import { PGlite } from '@electric-sql/pglite';
import { ConfigService } from '@nestjs/config';
import type { Mailer, MailSendOptions, MailSendResult } from '@nestjs/mail';
import { errorStatus } from '@unicore/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createUser, testPassword } from '../../test/users.js';
import { DomainError } from '../common/domain-error.js';
import type { Env } from '../config/env.js';
import { type Db, migrationsFolder } from '../db/database.js';
import { emailTokens, profiles, refreshTokens, users } from '../db/schema.js';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from './email-verification.service.js';
import { TokensService } from './tokens.service.js';
import { UsersService } from './users.service.js';

let client: PGlite;
let db: Db;
let tokens: TokensService;
let verification: EmailVerificationService;
/** AUTH_REQUIRE_EMAIL_VERIFICATION=false, the default. */
let service: AuthService;
/** AUTH_REQUIRE_EMAIL_VERIFICATION=true. */
let strict: AuthService;
const send = vi.fn<(options: MailSendOptions) => Promise<MailSendResult>>();

// The services on their own, without Nest: an in-memory PGlite and a stand-in Mailer.
beforeAll(async () => {
  client = await PGlite.create();
  const pglite = drizzle({ client });
  await migrate(pglite, { migrationsFolder });
  db = pglite;
  const env = {
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
    ACCESS_TTL: 900,
    REFRESH_TTL: 30 * 86_400,
    PUBLIC_BASE_URL: 'http://localhost:3000',
  };
  const config = (requireVerifiedEmail: boolean) =>
    new ConfigService<Env, true>({ ...env, AUTH_REQUIRE_EMAIL_VERIFICATION: requireVerifiedEmail });
  const users = new UsersService(db);
  tokens = new TokensService(db, config(false));
  verification = new EmailVerificationService(db, { send } as unknown as Mailer, config(false));
  service = new AuthService(users, tokens, verification, config(false));
  strict = new AuthService(users, tokens, verification, config(true));
});

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({} as MailSendResult);
});

afterAll(async () => {
  await client.close();
});

/** The code of the DomainError the promise rejects with. */
async function errorCode(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).code;
}

const sessionsOf = (userId: string) =>
  db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));

describe('AuthService.signUp', () => {
  it('creates a student and opens a session for them', async () => {
    const result = await service.signUp({
      email: 'new@example.test',
      password: 'correct horse',
      name: 'Аня',
    });
    if (!('accessToken' in result)) throw new Error('expected tokens');

    const userId = await tokens.verifyAccessToken(result.accessToken);
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    expect(profile).toMatchObject({ accountKind: 'student', name: 'Аня' });
    expect(await sessionsOf(userId)).toHaveLength(1);
    expect(result.expiresIn).toBe(900);
  });

  it('rejects a partner until codes exist (task 3.5): UNICORE_INVALID_CODE, 422, nothing written', async () => {
    const code = await errorCode(
      service.signUp({
        email: 'company@example.test',
        password: 'correct horse',
        name: 'Боря',
        partner: { company: 'Компания', code: 'some-code' },
      }),
    );
    expect(code).toBe('UNICORE_INVALID_CODE');
    expect(errorStatus.UNICORE_INVALID_CODE).toBe(422);
    expect(await db.select().from(users).where(eq(users.email, 'company@example.test'))).toEqual(
      [],
    );
  });
});

describe('AuthService.signIn', () => {
  it('opens a new session on every sign-in', async () => {
    const user = await createUser(db);
    const first = await service.signIn({
      email: user.email,
      password: testPassword,
      portal: 'student',
    });
    const second = await service.signIn({
      email: user.email,
      password: testPassword,
      portal: 'student',
    });
    expect(await tokens.verifyAccessToken(first.accessToken)).toBe(user.id);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const sessions = await sessionsOf(user.id);
    expect(new Set(sessions.map((row) => row.familyId)).size).toBe(2);
  });

  it('issues no tokens for a wrong password or the wrong portal', async () => {
    const user = await createUser(db);
    expect(
      await errorCode(
        service.signIn({ email: user.email, password: 'wrong-password', portal: 'student' }),
      ),
    ).toBe('UNICORE_INVALID_CREDENTIALS');
    expect(
      await errorCode(
        service.signIn({ email: user.email, password: testPassword, portal: 'partner' }),
      ),
    ).toBe('UNICORE_WRONG_PORTAL');
    expect(await sessionsOf(user.id)).toEqual([]);
  });
});

describe('with AUTH_REQUIRE_EMAIL_VERIFICATION', () => {
  const credentials = (email: string) => ({
    email,
    password: testPassword,
    portal: 'student' as const,
  });

  it('signs up without a session and mails a link stored with the account', async () => {
    const result = await strict.signUp({
      email: 'strict@example.test',
      password: 'correct horse',
      name: 'Аня',
    });
    expect(result).toEqual({ verificationRequired: true });

    const [user] = await db.select().from(users).where(eq(users.email, 'strict@example.test'));
    expect(user.emailVerifiedAt).toBeNull();
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await db.select().from(emailTokens).where(eq(emailTokens.userId, user.id))).toHaveLength(
      1,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].to).toBe('strict@example.test');
    expect(send.mock.calls[0][0].text).toContain('http://localhost:3000/v1/auth/verify?token=');
  });

  it('turns an unconfirmed email away: UNICORE_EMAIL_NOT_CONFIRMED, 403, no session', async () => {
    const user = await createUser(db, { verified: false });
    expect(await errorCode(strict.signIn(credentials(user.email)))).toBe(
      'UNICORE_EMAIL_NOT_CONFIRMED',
    );
    expect(errorStatus.UNICORE_EMAIL_NOT_CONFIRMED).toBe(403);
    expect(await sessionsOf(user.id)).toEqual([]);
  });

  it('checks the password and the portal first', async () => {
    const user = await createUser(db, { verified: false });
    expect(
      await errorCode(strict.signIn({ ...credentials(user.email), password: 'wrong-password' })),
    ).toBe('UNICORE_INVALID_CREDENTIALS');
    expect(await errorCode(strict.signIn({ ...credentials(user.email), portal: 'partner' }))).toBe(
      'UNICORE_WRONG_PORTAL',
    );
  });

  it('lets a confirmed email in', async () => {
    const user = await createUser(db);
    const session = await strict.signIn(credentials(user.email));
    expect(await tokens.verifyAccessToken(session.accessToken)).toBe(user.id);
  });

  it('is off by default: an unconfirmed email signs in and sign-up mails nothing', async () => {
    const user = await createUser(db, { verified: false });
    await service.signIn(credentials(user.email));
    await service.signUp({ email: 'relaxed@example.test', password: 'correct horse', name: 'Аня' });
    expect(send).not.toHaveBeenCalled();
  });
});
