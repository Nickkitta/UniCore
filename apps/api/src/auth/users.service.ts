import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { normalizeEmail } from '@unicore/shared';
import { DomainError } from '../common/domain-error.js';
import type { Db } from '../db/database.js';
import { profiles, users } from '../db/schema.js';
import { assertStrongPassword, hashPassword } from './password.js';

/** A new student account. The name comes checked by the schema (1–40 after trim). */
export interface NewAccount {
  email: string;
  password: string;
  name: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  /**
   * Creates a student with a profile in one transaction. Throws UNICORE_WEAK_PASSWORD
   * and UNICORE_EMAIL_TAKEN; the email is stored normalized.
   */
  async create(account: NewAccount): Promise<{ id: string; email: string }> {
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
      return user.id;
    });

    return { id, email };
  }
}
