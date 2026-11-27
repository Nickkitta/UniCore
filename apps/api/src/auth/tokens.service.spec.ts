import { PGlite } from '@electric-sql/pglite';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createUser } from '../../test/users.js';
import { DomainError } from '../common/domain-error.js';
import type { Env } from '../config/env.js';
import { type Db, migrationsFolder } from '../db/database.js';
import { refreshTokens } from '../db/schema.js';
import { hashRefreshToken, TokensService } from './tokens.service.js';

let client: PGlite;
let db: Db;
let service: TokensService;

const accessTtl = 900;
const refreshTtl = 30 * 86_400;

// The service on its own, without Nest: an in-memory PGlite with the migrations applied.
beforeAll(async () => {
  client = await PGlite.create();
  const pglite = drizzle({ client });
  await migrate(pglite, { migrationsFolder });
  db = pglite;
  const config = new ConfigService<Env, true>({
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
    ACCESS_TTL: accessTtl,
    REFRESH_TTL: refreshTtl,
  });
  service = new TokensService(db, config);
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

const rowOf = (token: string) =>
  db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)))
    .then((rows) => rows[0]);

const familyRows = (familyId: string) =>
  db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.familyId, familyId))
    .orderBy(asc(refreshTokens.createdAt));

describe('TokensService', () => {
  it('issues a session and keeps only a hash of the refresh token', async () => {
    const user = await createUser(db);
    const before = Date.now();
    const tokens = await service.issue(user.id);

    expect(tokens.expiresIn).toBe(accessTtl);
    expect(tokens.refreshToken).toMatch(/^[\w-]{43}$/);
    expect(await service.verifyAccessToken(tokens.accessToken)).toBe(user.id);

    const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id));
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.tokenHash.equals(hashRefreshToken(tokens.refreshToken))).toBe(true);
    expect(Object.values(row)).not.toContain(tokens.refreshToken);
    expect(row.tokenHash.toString('base64url')).not.toBe(tokens.refreshToken);
    expect(row).toMatchObject({ usedAt: null, revokedAt: null });
    const expiresIn = row.expiresAt.getTime() - before;
    expect(expiresIn).toBeGreaterThanOrEqual(refreshTtl * 1000 - 1000);
    expect(expiresIn).toBeLessThanOrEqual(refreshTtl * 1000 + 5000);
  });

  it('exchanges a refresh token for a new pair in the same family', async () => {
    const user = await createUser(db);
    const first = await service.issue(user.id);
    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.expiresIn).toBe(accessTtl);
    expect(await service.verifyAccessToken(second.accessToken)).toBe(user.id);

    const [spent, next] = [await rowOf(first.refreshToken), await rowOf(second.refreshToken)];
    expect(spent.usedAt).toBeInstanceOf(Date);
    expect(next).toMatchObject({ familyId: spent.familyId, userId: user.id, usedAt: null });
    expect(next.revokedAt).toBeNull();
    expect(next.expiresAt.getTime()).toBeGreaterThan(spent.expiresAt.getTime() - 1);

    // The chain goes on: the new token is exchanged in its turn.
    const third = await service.refresh(second.refreshToken);
    expect((await rowOf(third.refreshToken)).familyId).toBe(spent.familyId);
  });

  it('answers a spent token with 401 and revokes the whole session', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const user = await createUser(db);
    const first = await service.issue(user.id);
    const second = await service.refresh(first.refreshToken);

    expect(await errorCode(service.refresh(first.refreshToken))).toBe('UNICORE_AUTH_REQUIRED');
    // The legitimate holder of the newer token has to sign in again too.
    expect(await errorCode(service.refresh(second.refreshToken))).toBe('UNICORE_AUTH_REQUIRED');

    const family = await familyRows((await rowOf(first.refreshToken)).familyId);
    expect(family).toHaveLength(2);
    expect(family.every((row) => row.revokedAt instanceof Date)).toBe(true);

    // Logged once, with the session and the user but without the token.
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain(user.id);
    expect(message).not.toContain(first.refreshToken);
    warn.mockRestore();
  });

  it('revokes only the session the spent token belongs to', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const user = await createUser(db);
    const phone = await service.issue(user.id);
    const laptop = await service.issue(user.id);

    await service.refresh(phone.refreshToken);
    expect(await errorCode(service.refresh(phone.refreshToken))).toBe('UNICORE_AUTH_REQUIRED');

    const next = await service.refresh(laptop.refreshToken);
    expect(await service.verifyAccessToken(next.accessToken)).toBe(user.id);
    warn.mockRestore();
  });

  it('lets one of two parallel refreshes with one token through and revokes the session', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const user = await createUser(db);
    const { refreshToken } = await service.issue(user.id);

    const results = await Promise.allSettled([
      service.refresh(refreshToken),
      service.refresh(refreshToken),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const reasons = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    expect(reasons).toEqual([expect.objectContaining({ code: 'UNICORE_AUTH_REQUIRED' })]);

    const winner = results.find((result) => result.status === 'fulfilled');
    expect(await errorCode(service.refresh(winner?.value.refreshToken ?? ''))).toBe(
      'UNICORE_AUTH_REQUIRED',
    );
    warn.mockRestore();
  });

  it('answers an unknown or expired token with 401', async () => {
    expect(await errorCode(service.refresh('not-a-token'))).toBe('UNICORE_AUTH_REQUIRED');

    const user = await createUser(db);
    const { refreshToken } = await service.issue(user.id);
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)));
    expect(await errorCode(service.refresh(refreshToken))).toBe('UNICORE_AUTH_REQUIRED');
    expect((await rowOf(refreshToken)).usedAt).toBeNull();
  });

  it('signs out: a revoked token no longer refreshes', async () => {
    const user = await createUser(db);
    const first = await service.issue(user.id);
    const second = await service.refresh(first.refreshToken);

    await service.revoke(second.refreshToken);
    expect(await errorCode(service.refresh(second.refreshToken))).toBe('UNICORE_AUTH_REQUIRED');
    const family = await familyRows((await rowOf(second.refreshToken)).familyId);
    expect(family.every((row) => row.revokedAt instanceof Date)).toBe(true);

    // Signing out twice, or with a token the server doesn't know, is not an error.
    await expect(service.revoke(second.refreshToken)).resolves.toBeUndefined();
    await expect(service.revoke('not-a-token')).resolves.toBeUndefined();
  });
});
