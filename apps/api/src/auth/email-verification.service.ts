import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import { html, Mailer } from '@nestjs/mail';
import { apiPrefix, normalizeEmail } from '@unicore/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Env } from '../config/env.js';
import type { Db, Tx } from '../db/database.js';
import { emailTokens, users } from '../db/schema.js';

const purpose = 'verify_email';

/** A link from the email works for a day. */
export const verificationLinkTtlMs = 24 * 60 * 60 * 1000;

/** resend-verification sends at most one email a minute to an account. */
export const resendIntervalMs = 60 * 1000;

/** What opening a link did; the page for each is in verify-page.ts. */
export type VerifyOutcome = 'verified' | 'already' | 'expired' | 'invalid';

/** The database keeps only sha256 of the token from the link. */
export function hashEmailToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/**
 * Email confirmation: a one-time link valid for 24 hours. Mail goes out in the background,
 * so a response never waits for SMTP and its timing doesn't tell whether an account exists.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly verifyUrl: string;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    private readonly mailer: Mailer,
    config: ConfigService<Env, true>,
  ) {
    this.verifyUrl = `${config.get('PUBLIC_BASE_URL', { infer: true })}/${apiPrefix}/auth/verify`;
  }

  /** A new link token for the user: 32 random bytes in base64url, only the hash is stored. */
  async issue(db: Db | Tx, userId: string, now = new Date()): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await db.insert(emailTokens).values({
      tokenHash: hashEmailToken(token),
      userId,
      purpose,
      expiresAt: new Date(now.getTime() + verificationLinkTtlMs),
      createdAt: now,
    });
    return token;
  }

  /** The link from the email: PUBLIC_BASE_URL/v1/auth/verify?token=… */
  link(token: string): string {
    return `${this.verifyUrl}?token=${token}`;
  }

  /**
   * Starts sending the email with the link and returns at once. A failure is logged with the
   * user id, never with the link: the account exists, and resend-verification sends another.
   */
  sendLink(user: { id: string; email: string }, token: string): void {
    const link = this.link(token);
    void this.mailer
      .send({
        to: user.email,
        subject: 'Подтверди почту в UniCore',
        html: html`<p>Привет!</p>
          <p>Чтобы входить в UniCore, подтверди почту: <a href="${link}">подтвердить почту</a>.</p>
          <p>Ссылка действует 24 часа и сработает один раз.</p>
          <p>Если ты не регистрировался в UniCore, просто удали это письмо.</p>`,
        text: [
          'Привет!',
          '',
          'Чтобы входить в UniCore, подтверди почту — открой ссылку:',
          link,
          '',
          'Ссылка действует 24 часа и сработает один раз.',
          'Если ты не регистрировался в UniCore, просто удали это письмо.',
        ].join('\n'),
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        this.logger.error(`Could not send the confirmation email to user ${user.id}: ${reason}`);
      });
  }

  /**
   * Opens a link: confirms the email once. A link of an already confirmed email changes
   * nothing, so a second click (or a mail scanner that opened the link first) is harmless.
   */
  async verify(token: string, now = new Date()): Promise<VerifyOutcome> {
    return this.db.transaction(async (tx): Promise<VerifyOutcome> => {
      // Locks the token and its user: two clicks on one link take turns.
      const rows = await tx
        .select({
          userId: emailTokens.userId,
          expiresAt: emailTokens.expiresAt,
          usedAt: emailTokens.usedAt,
          verifiedAt: users.emailVerifiedAt,
        })
        .from(emailTokens)
        .innerJoin(users, eq(users.id, emailTokens.userId))
        .where(
          and(eq(emailTokens.tokenHash, hashEmailToken(token)), eq(emailTokens.purpose, purpose)),
        )
        .for('update');
      const row = rows.at(0);

      if (!row) return 'invalid';
      if (row.verifiedAt) return 'already';
      // A spent link always confirmed the email; without that it can only be a broken row.
      if (row.usedAt) return 'invalid';
      if (row.expiresAt <= now) return 'expired';

      await tx
        .update(emailTokens)
        .set({ usedAt: now })
        .where(eq(emailTokens.tokenHash, hashEmailToken(token)));
      await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, row.userId));
      return 'verified';
    });
  }

  /**
   * Sends a new link to an account whose email is not confirmed yet, at most once a minute.
   * Does nothing otherwise, and the caller answers the same either way: the answer must not
   * tell whether the account exists. Older links keep working until they expire.
   */
  async resend(email: string, now = new Date()): Promise<void> {
    const issued = await this.db.transaction(async (tx) => {
      // The user row lock makes parallel requests take turns, so they can't both send.
      const rows = await tx
        .select({ id: users.id, email: users.email, verifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.email, normalizeEmail(email)))
        .for('update');
      const user = rows.at(0);
      if (!user || user.verifiedAt) return undefined;

      const [last] = await tx
        .select({ createdAt: emailTokens.createdAt })
        .from(emailTokens)
        .where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose)))
        .orderBy(desc(emailTokens.createdAt))
        .limit(1);
      if (last && now.getTime() - last.createdAt.getTime() < resendIntervalMs) return undefined;

      return { user, token: await this.issue(tx, user.id, now) };
    });

    if (issued) this.sendLink(issued.user, issued.token);
  }
}
