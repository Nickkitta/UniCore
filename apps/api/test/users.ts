import type { AccountKind } from '@unicore/shared';
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
}

/**
 * Not an argon2 hash, so no password signs in with it. Task 3.1 puts a real hash here
 * and returns the password with the user.
 */
const passwordHash = '!test-user-without-password';

let emailCounter = 0;

/** Creates a user with a profile straight in the database, in one transaction. */
export async function createUser(db: Db, options: TestUserOptions = {}): Promise<TestUser> {
  const kind = options.kind ?? 'student';
  const email = (options.email ?? `user-${++emailCounter}@example.test`).trim().toLowerCase();
  const verified = options.verified ?? true;

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

  return { id, email, kind };
}
