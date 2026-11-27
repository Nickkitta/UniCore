import { PGlite } from '@electric-sql/pglite';
import { ConfigService } from '@nestjs/config';
import { errorStatus } from '@unicore/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createUser, testPassword } from '../../test/users.js';
import { DomainError } from '../common/domain-error.js';
import type { Env } from '../config/env.js';
import { type Db, migrationsFolder } from '../db/database.js';
import { profiles, refreshTokens, users } from '../db/schema.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';
import { UsersService } from './users.service.js';

let client: PGlite;
let db: Db;
let tokens: TokensService;
let service: AuthService;

// The services on their own, without Nest: an in-memory PGlite with the migrations applied.
beforeAll(async () => {
  client = await PGlite.create();
  const pglite = drizzle({ client });
  await migrate(pglite, { migrationsFolder });
  db = pglite;
  const config = new ConfigService<Env, true>({
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
    ACCESS_TTL: 900,
    REFRESH_TTL: 30 * 86_400,
  });
  tokens = new TokensService(db, config);
  service = new AuthService(new UsersService(db), tokens);
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
