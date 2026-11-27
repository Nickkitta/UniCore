import { type AccountKind, normalizeEmail } from '@unicore/shared';
import { accessTokenKey, signAccessToken } from '../src/auth/access-token.js';
import { hashPassword } from '../src/auth/password.js';
import { envSchema } from '../src/config/env.js';
import type { Db } from '../src/db/database.js';
import { admins, profiles, users } from '../src/db/schema.js';

export interface TestUserOptions {
  /** `student` by default. */
  kind?: AccountKind;
  /** A unique `user-<n>@example.test` by default; trimmed and lowercased like the API does. */
  email?: string;
  /** `Студент` or `Партнёр` by default. */
  name?: string;
  /** Also grants the admin role. */
  admin?: boolean;
  /** The email is confirmed by default. */
  verified?: boolean;
  /** Other profile fields; a partner gets a company unless one is given. */
  profile?: Partial<Omit<typeof profiles.$inferInsert, 'id' | 'accountKind' | 'name'>>;
}

export interface TestUser {
  id: string;
  email: string;
  kind: AccountKind;
  /** The password of every test user, `testPassword`: for signing in. */
  password: string;
}

/** Every test user has this password. */
export const testPassword = 'test-password';

let hashOnce: Promise<string> | undefined;

/**
 * A real argon2id hash made by the server's code, computed once per process: hashing is
 * deliberately slow, and the tests create many users.
 */
function testPasswordHash() {
  hashOnce ??= hashPassword(testPassword);
  return hashOnce;
}

let emailCounter = 0;

/** Creates a user with a profile straight in the database, in one transaction. */
export async function createUser(db: Db, options: TestUserOptions = {}): Promise<TestUser> {
  const kind = options.kind ?? 'student';
  const email = normalizeEmail(options.email ?? `user-${++emailCounter}@example.test`);
  const verified = options.verified ?? true;
  const passwordHash = await testPasswordHash();

  const id = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, emailVerifiedAt: verified ? new Date() : null })
      .returning({ id: users.id });
    await tx.insert(profiles).values({
      ...(kind === 'partner' ? { company: 'Тестовая компания' } : {}),
      ...options.profile,
      id: user.id,
      accountKind: kind,
      name: options.name ?? (kind === 'partner' ? 'Партнёр' : 'Студент'),
    });
    if (options.admin) await tx.insert(admins).values({ userId: user.id });
    return user.id;
  });

  return { id, email, kind, password: testPassword };
}

/**
 * `Authorization: Bearer <access token>` for the user: `.set(await authHeader(user))`.
 * Signed by the server's code with JWT_SECRET and ACCESS_TTL parsed from the same variables
 * as the app's (vitest.config.e2e.ts), so the app accepts it.
 */
export async function authHeader(user: { id: string }): Promise<{ Authorization: string }> {
  const env = envSchema.parse(process.env);
  const token = await signAccessToken({
    key: accessTokenKey(env.JWT_SECRET),
    userId: user.id,
    ttlSeconds: env.ACCESS_TTL,
  });
  return { Authorization: `Bearer ${token}` };
}
