import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { Tokens } from '@unicore/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { DomainError } from '../common/domain-error.js';
import type { Env } from '../config/env.js';
import type { Db, Tx } from '../db/database.js';
import { refreshTokens } from '../db/schema.js';
import { accessTokenKey, signAccessToken, verifyAccessToken } from './access-token.js';

/** 32 random bytes in base64url: what the client keeps and sends back. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The database keeps only sha256 of the token. The string is hashed as sent, so input that is
 * not base64url at all is simply not found.
 */
export function hashRefreshToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** What the refresh transaction decided; the error is thrown after it commits. */
type RefreshOutcome =
  | { kind: 'rotated'; userId: string; refreshToken: string }
  | { kind: 'reused'; userId: string; familyId: string }
  | { kind: 'invalid' };

/**
 * Sessions: a short JWT for access and a refresh token rotated on every use
 * (docs/backend-architecture.md, section 5). All refresh tokens of one sign-in form a family;
 * presenting a token that was already exchanged means it was copied, so the whole family
 * is revoked.
 */
@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private readonly accessKey: Uint8Array;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    config: ConfigService<Env, true>,
  ) {
    this.accessKey = accessTokenKey(config.get('JWT_SECRET', { infer: true }));
    this.accessTtl = config.get('ACCESS_TTL', { infer: true });
    this.refreshTtl = config.get('REFRESH_TTL', { infer: true });
  }

  /** A new session for a signed-in user: a new family. */
  async issue(userId: string): Promise<Tokens> {
    const refreshToken = await this.insertRefreshToken(this.db, userId, randomUUID(), new Date());
    return this.tokens(userId, refreshToken);
  }

  /**
   * Exchanges a refresh token for a new pair in the same family. An unknown, revoked or expired
   * token throws UNICORE_AUTH_REQUIRED; so does a spent one, after revoking its family.
   */
  async refresh(refreshToken: string): Promise<Tokens> {
    const now = new Date();
    const outcome = await this.db.transaction(async (tx): Promise<RefreshOutcome> => {
      // The row lock makes two refreshes with one token take turns: the second sees it spent.
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)))
        .for('update');
      if (!row || row.revokedAt || row.expiresAt <= now) return { kind: 'invalid' };
      if (row.usedAt) {
        await this.revokeFamily(tx, row.familyId, now);
        return { kind: 'reused', userId: row.userId, familyId: row.familyId };
      }
      await tx.update(refreshTokens).set({ usedAt: now }).where(eq(refreshTokens.id, row.id));
      const next = await this.insertRefreshToken(tx, row.userId, row.familyId, now);
      return { kind: 'rotated', userId: row.userId, refreshToken: next };
    });

    // Thrown out here and not inside the transaction: that would roll the revocation back.
    if (outcome.kind === 'reused') {
      this.logger.warn(
        `A spent refresh token was presented again: session ${outcome.familyId} of user ${outcome.userId} is revoked`,
      );
    }
    if (outcome.kind !== 'rotated') throw new DomainError('UNICORE_AUTH_REQUIRED');
    return this.tokens(outcome.userId, outcome.refreshToken);
  }

  /** Sign-out: revokes the family of the token. An unknown token is ignored. */
  async revoke(refreshToken: string): Promise<void> {
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
    if (row) await this.revokeFamily(this.db, row.familyId, new Date());
  }

  /** The user id from a valid access token; otherwise UNICORE_AUTH_REQUIRED. */
  verifyAccessToken(accessToken: string): Promise<string> {
    return verifyAccessToken(this.accessKey, accessToken);
  }

  private async tokens(userId: string, refreshToken: string): Promise<Tokens> {
    const accessToken = await signAccessToken({
      key: this.accessKey,
      userId,
      ttlSeconds: this.accessTtl,
    });
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  private async insertRefreshToken(db: Db | Tx, userId: string, familyId: string, now: Date) {
    const token = newRefreshToken();
    await db.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(now.getTime() + this.refreshTtl * 1000),
    });
    return token;
  }

  private async revokeFamily(db: Db | Tx, familyId: string, now: Date) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }
}
