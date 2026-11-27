import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { minPasswordLength } from '@unicore/shared';
import { DomainError } from '../common/domain-error.js';

/**
 * argon2id at the OWASP minimum: 19 MiB of memory, 2 passes, 1 thread. They match the defaults
 * of @node-rs/argon2 2.x and are spelled out so that a new default can't change the policy.
 * `algorithm` is left at its default, Argon2id: the package declares it as a `const enum`,
 * which `isolatedModules` doesn't allow to import. The tests check the `$argon2id$` prefix.
 */
export const passwordHashOptions = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** A PHC string with the algorithm, the parameters and a random salt. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, passwordHashOptions);
}

/** The parameters come from the hash itself, so older hashes still verify. */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

/**
 * The hash of a random string with the same parameters as real ones, computed once per process.
 * UsersService computes it at startup, so even the first sign-in waits no longer than usual.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  return dummyHash;
}

/**
 * Like verifyPassword, but with no account (`undefined`) it checks the password against
 * the dummy hash and answers false: the time of the answer doesn't tell whether the email
 * is registered.
 */
export async function verifyPasswordOrDummy(
  passwordHash: string | undefined,
  password: string,
): Promise<boolean> {
  if (passwordHash !== undefined) return verifyPassword(passwordHash, password);
  await verifyPassword(await dummyPasswordHash(), password);
  return false;
}

/** Throws UNICORE_WEAK_PASSWORD for a password shorter than the app allows. */
export function assertStrongPassword(password: string): void {
  if (password.length < minPasswordLength) throw new DomainError('UNICORE_WEAK_PASSWORD');
}
