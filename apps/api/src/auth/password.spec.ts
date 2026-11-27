import { errorStatus } from '@unicore/shared';
import { DomainError } from '../common/domain-error.js';
import { assertStrongPassword, hashPassword, verifyPassword } from './password.js';

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
});
