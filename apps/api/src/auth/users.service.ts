import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { type AccountKind, normalizeEmail } from '@unicore/shared';
import { eq } from 'drizzle-orm';
import { DomainError } from '../common/domain-error.js';
import type { Db, Tx } from '../db/database.js';
import { profiles, users } from '../db/schema.js';
import {
  assertStrongPassword,
  dummyPasswordHash,
  hashPassword,
  verifyPasswordOrDummy,
} from './password.js';

/** A new student account. The name comes checked by the schema (1–40 after trim). */
export interface NewAccount {
  email: string;
  password: string;
  name: string;
}

/** What a sign-in presents: the portal is the kind of account the user chose on the screen. */
export interface Credentials {
  email: string;
  password: string;
  portal: AccountKind;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  /** The dummy hash is ready before the app takes requests: see verifyPasswordOrDummy. */
  async onModuleInit() {
    await dummyPasswordHash();
  }

  /**
   * Creates a student with a profile in one transaction. Throws UNICORE_WEAK_PASSWORD
   * and UNICORE_EMAIL_TAKEN; the email is stored normalized. `inTransaction` runs in the same
   * transaction after the profile (the email confirmation link): if it throws, there is no account.
   */
  async create(
    account: NewAccount,
    inTransaction?: (tx: Tx, userId: string) => Promise<void>,
  ): Promise<{ id: string; email: string }> {
    const email = normalizeEmail(account.email);
    assertStrongPassword(account.password);
    // Hashing takes tens of milliseconds: done before the transaction, not inside it.
    const passwordHash = await hashPassword(account.password);

    const id = await this.db.transaction(async (tx) => {
      // No "check, then insert" race: a parallel sign-up with the same email waits for the
      // unique index and gets no row back.
      const [user] = await tx
        .insert(users)
        .values({ email, passwordHash })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (!user) throw new DomainError('UNICORE_EMAIL_TAKEN');
      await tx.insert(profiles).values({ id: user.id, accountKind: 'student', name: account.name });
      await inTransaction?.(tx, user.id);
      return user.id;
    });

    return { id, email };
  }

  /**
   * The user the credentials belong to. A wrong password and an unknown email both throw
   * UNICORE_INVALID_CREDENTIALS and take the same time; an account of another kind than the
   * portal throws UNICORE_WRONG_PORTAL. Whether an unconfirmed email may sign in is up to the caller.
   */
  async authenticate(credentials: Credentials): Promise<{ id: string; emailVerified: boolean }> {
    const rows = await this.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        emailVerifiedAt: users.emailVerifiedAt,
        accountKind: profiles.accountKind,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.id, users.id))
      .where(eq(users.email, normalizeEmail(credentials.email)));
    const user = rows.at(0);

    const valid = await verifyPasswordOrDummy(user?.passwordHash, credentials.password);
    if (!user || !valid) throw new DomainError('UNICORE_INVALID_CREDENTIALS');
    // Only after the password: otherwise anyone could learn the kind of an account by its email.
    if (user.accountKind !== credentials.portal) throw new DomainError('UNICORE_WRONG_PORTAL');
    return { id: user.id, emailVerified: user.emailVerifiedAt !== null };
  }
}
