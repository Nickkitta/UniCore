import { PGlite } from '@electric-sql/pglite';
import { errorStatus } from '@unicore/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { DomainError } from '../common/domain-error.js';
import { type Db, migrationsFolder } from '../db/database.js';
import { profiles, users } from '../db/schema.js';
import { verifyPassword } from './password.js';
import { UsersService } from './users.service.js';

let client: PGlite;
let db: Db;
let service: UsersService;

// The service on its own, without Nest: an in-memory PGlite with the migrations applied.
beforeAll(async () => {
  client = await PGlite.create();
  const pglite = drizzle({ client });
  await migrate(pglite, { migrationsFolder });
  db = pglite;
  service = new UsersService(db);
});

afterAll(async () => {
  await client.close();
});

const password = 'correct horse';

const usersWithEmail = (email: string) => db.select().from(users).where(eq(users.email, email));

/** The code of the DomainError the promise rejects with. */
async function errorCode(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).code;
}

describe('UsersService.create', () => {
  it('creates a student with a profile and keeps only a hash of the password', async () => {
    const { id, email } = await service.create({
      email: 'anya@example.test',
      password,
      name: 'Аня',
    });
    expect(email).toBe('anya@example.test');

    const [user] = await usersWithEmail(email);
    expect(user.id).toBe(id);
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).not.toContain(password);
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(user.passwordHash, password)).toBe(true);

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    expect(profile).toMatchObject({ accountKind: 'student', name: 'Аня', company: '' });
  });

  it('treats `Test@Example.com ` and `test@example.com` as one account: UNICORE_EMAIL_TAKEN, 409', async () => {
    const first = await service.create({ email: 'Test@Example.com ', password, name: 'Аня' });
    expect(first.email).toBe('test@example.com');

    const code = await errorCode(
      service.create({ email: 'test@example.com', password, name: 'Боря' }),
    );
    expect(code).toBe('UNICORE_EMAIL_TAKEN');
    expect(errorStatus[code]).toBe(409);
    expect(await usersWithEmail('test@example.com')).toHaveLength(1);
  });

  it('rejects a short password before writing anything: UNICORE_WEAK_PASSWORD, 422', async () => {
    const code = await errorCode(
      service.create({ email: 'short@example.test', password: '1234567', name: 'Аня' }),
    );
    expect(code).toBe('UNICORE_WEAK_PASSWORD');
    expect(errorStatus[code]).toBe(422);
    expect(await usersWithEmail('short@example.test')).toEqual([]);
  });

  it('lets only one of two parallel sign-ups with one email through', async () => {
    const results = await Promise.allSettled([
      service.create({ email: 'race@example.test', password, name: 'Аня' }),
      service.create({ email: 'race@example.test', password, name: 'Боря' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const reasons = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    expect(reasons).toEqual([expect.objectContaining({ code: 'UNICORE_EMAIL_TAKEN' })]);
    expect(await usersWithEmail('race@example.test')).toHaveLength(1);
  });

  it('writes the user and the profile in one transaction', async () => {
    // A name the schema would reject breaks the profile CHECK: the user must not stay behind.
    await expect(
      service.create({ email: 'long@example.test', password, name: 'я'.repeat(41) }),
    ).rejects.toThrow();
    expect(await usersWithEmail('long@example.test')).toEqual([]);
  });
});
