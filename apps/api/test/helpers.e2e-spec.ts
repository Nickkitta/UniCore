import { eq } from 'drizzle-orm';
import { admins, profiles, users } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './app.js';
import { createUser } from './users.js';

describe('test helpers', () => {
  let first: TestApp;
  let second: TestApp;

  beforeAll(async () => {
    [first, second] = await Promise.all([createTestApp(), createTestApp()]);
  });

  afterAll(async () => {
    await Promise.all([first.close(), second.close()]);
  });

  const userRow = (t: TestApp, id: string) =>
    t.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .then((rows) => rows[0]);
  const profileRow = (t: TestApp, id: string) =>
    t.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .then((rows) => rows[0]);

  it('gives every app a database of its own', async () => {
    const user = await createUser(first.db);
    expect(await userRow(first, user.id)).toBeDefined();
    expect(await userRow(second, user.id)).toBeUndefined();
  });

  it('creates a student with a profile and a confirmed email', async () => {
    const user = await createUser(first.db);
    expect(user.kind).toBe('student');
    expect((await userRow(first, user.id))?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await profileRow(first, user.id)).toMatchObject({
      accountKind: 'student',
      name: 'Студент',
    });
  });

  it('gives every user its own email and keeps a given one normalized', async () => {
    const [a, b] = [await createUser(first.db), await createUser(first.db)];
    expect(a.email).not.toBe(b.email);

    const named = await createUser(first.db, { email: ' Named@Example.TEST ' });
    expect(named.email).toBe('named@example.test');
    expect((await userRow(first, named.id))?.email).toBe('named@example.test');
  });

  it('creates a partner with a company', async () => {
    const partner = await createUser(first.db, { kind: 'partner' });
    expect(await profileRow(first, partner.id)).toMatchObject({
      accountKind: 'partner',
      name: 'Партнёр',
      company: 'Тестовая компания',
    });
  });

  it('passes profile fields through', async () => {
    const user = await createUser(first.db, {
      name: 'Аня',
      profile: { faculty: 'ИМИТ', course: '4', interests: ['Спорт'] },
    });
    expect(await profileRow(first, user.id)).toMatchObject({
      name: 'Аня',
      faculty: 'ИМИТ',
      course: '4',
      interests: ['Спорт'],
    });
  });

  it('grants the admin role and leaves an email unconfirmed on request', async () => {
    const admin = await createUser(first.db, { admin: true, verified: false });
    const rows = await first.db.select().from(admins).where(eq(admins.userId, admin.id));
    expect(rows).toHaveLength(1);
    expect((await userRow(first, admin.id))?.emailVerifiedAt).toBeNull();

    const student = await createUser(first.db);
    expect(await first.db.select().from(admins).where(eq(admins.userId, student.id))).toEqual([]);
  });
});
