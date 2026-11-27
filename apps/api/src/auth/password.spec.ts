import { verify } from '@node-rs/argon2';
import { errorStatus } from '@unicore/shared';
import { DomainError } from '../common/domain-error.js';
import {
  assertStrongPassword,
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
  verifyPasswordOrDummy,
} from './password.js';

// The real argon2 with a call counter: shows that a missing account still costs a check.
vi.mock('@node-rs/argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@node-rs/argon2')>();
  return { ...actual, verify: vi.fn(actual.verify) };
});

describe('passwords', () => {
  it('hashes with argon2id at the OWASP minimum', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(hash).not.toContain('correct horse');
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword(hash, 'correct horse')).toBe(true);
    expect(await verifyPassword(hash, 'correct horsE')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('correct horse')).not.toBe(await hashPassword('correct horse'));
  });

  it('wants at least 8 characters: UNICORE_WEAK_PASSWORD, 422', () => {
    expect(() => assertStrongPassword('1234567')).toThrow(
      expect.objectContaining({ code: 'UNICORE_WEAK_PASSWORD' }) as DomainError,
    );
    expect(errorStatus.UNICORE_WEAK_PASSWORD).toBe(422);
    expect(() => assertStrongPassword('12345678')).not.toThrow();
  });

  it('checks against the hash when there is one', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPasswordOrDummy(hash, 'correct horse')).toBe(true);
    expect(await verifyPasswordOrDummy(hash, 'correct horsE')).toBe(false);
  });

  it('without an account still runs argon2 against a hash of the same cost and answers false', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await dummyPasswordHash()).toBe(dummy);

    vi.mocked(verify).mockClear();
    expect(await verifyPasswordOrDummy(undefined, 'correct horse')).toBe(false);
    expect(verify).toHaveBeenCalledExactlyOnceWith(dummy, 'correct horse');
  });
});
