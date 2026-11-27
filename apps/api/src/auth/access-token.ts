import { errors, type JWTPayload, jwtVerify, SignJWT } from 'jose';
import { DomainError } from '../common/domain-error.js';

// Access tokens: JWT HS256 signed with JWT_SECRET, `sub` is the user id, no roles
// (docs/backend-architecture.md, section 5). TokensService and the authHeader() test helper
// both sign with this code.

const algorithm = 'HS256';

/** The HMAC key made of JWT_SECRET. */
export function accessTokenKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export interface AccessTokenInput {
  key: Uint8Array;
  userId: string;
  ttlSeconds: number;
  /** When the token is issued; the tests pass a past moment to get an expired token. */
  now?: Date;
}

export function signAccessToken({
  key,
  userId,
  ttlSeconds,
  now = new Date(),
}: AccessTokenInput): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT()
    .setProtectedHeader({ alg: algorithm })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(key);
}

/**
 * The user id from a valid access token. A bad signature, an expired or malformed token,
 * another algorithm (`none` included) or a token without `sub` throw UNICORE_AUTH_REQUIRED.
 */
export async function verifyAccessToken(key: Uint8Array, token: string): Promise<string> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, key, {
      algorithms: [algorithm],
      requiredClaims: ['sub', 'exp'],
    }));
  } catch (error) {
    // Every failed check is a JOSEError; anything else is a bug and stays a 500.
    if (error instanceof errors.JOSEError) throw new DomainError('UNICORE_AUTH_REQUIRED');
    throw error;
  }
  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new DomainError('UNICORE_AUTH_REQUIRED');
  }
  return payload.sub;
}
