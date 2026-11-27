import { decodeJwt, SignJWT, UnsecuredJWT } from 'jose';
import { DomainError } from '../common/domain-error.js';
import { accessTokenKey, signAccessToken, verifyAccessToken } from './access-token.js';

const key = accessTokenKey('test-secret-that-is-at-least-32-characters');
const userId = '6f1d3c2e-8a4b-4c5d-9e0f-1a2b3c4d5e6f';
const ttlSeconds = 15 * 60;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/** The code of the DomainError the promise rejects with. */
async function errorCode(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).code;
}

describe('access tokens', () => {
  it('carries the user id in `sub` and lives for the given time', async () => {
    const token = await signAccessToken({ key, userId, ttlSeconds });
    expect(await verifyAccessToken(key, token)).toBe(userId);

    const claims = decodeJwt(token);
    expect(claims.sub).toBe(userId);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(ttlSeconds);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub']);
  });

  it('accepts a token until it expires', async () => {
    const fresh = await signAccessToken({ key, userId, ttlSeconds, now: minutesAgo(14) });
    expect(await verifyAccessToken(key, fresh)).toBe(userId);

    const expired = await signAccessToken({ key, userId, ttlSeconds, now: minutesAgo(16) });
    expect(await errorCode(verifyAccessToken(key, expired))).toBe('UNICORE_AUTH_REQUIRED');
  });

  it('rejects a token signed with another secret', async () => {
    const other = accessTokenKey('another-secret-that-is-at-least-32-chars');
    const token = await signAccessToken({ key: other, userId, ttlSeconds });
    expect(await errorCode(verifyAccessToken(key, token))).toBe('UNICORE_AUTH_REQUIRED');
  });

  it('rejects an unsigned token', async () => {
    const token = new UnsecuredJWT().setSubject(userId).setIssuedAt().setExpirationTime('15m');
    expect(await errorCode(verifyAccessToken(key, token.encode()))).toBe('UNICORE_AUTH_REQUIRED');
  });

  it('rejects a signed token without a subject or an expiry', async () => {
    const withoutSubject = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key);
    expect(await errorCode(verifyAccessToken(key, withoutSubject))).toBe('UNICORE_AUTH_REQUIRED');

    const withoutExpiry = await new SignJWT()
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .sign(key);
    expect(await errorCode(verifyAccessToken(key, withoutExpiry))).toBe('UNICORE_AUTH_REQUIRED');
  });

  it.each(['', 'garbage', 'a.b.c'])('rejects %j', async (token) => {
    expect(await errorCode(verifyAccessToken(key, token))).toBe('UNICORE_AUTH_REQUIRED');
  });
});
