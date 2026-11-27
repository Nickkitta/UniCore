import { readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { countAppliedMigrations, migrationsFolder } from './database.js';

const tables = [
  'activities',
  'admins',
  'email_tokens',
  'exclusions',
  'groups',
  'messages',
  'organizations',
  'participants',
  'partner_codes',
  'photos',
  'profiles',
  'refresh_tokens',
  'saved',
  'users',
];

let client: PGlite;

beforeAll(async () => {
  client = await PGlite.create();
  await migrate(drizzle({ client }), { migrationsFolder });
});

afterAll(async () => {
  await client.close();
});

/** Runs the statement and returns the name of the constraint it violates. */
async function violatedConstraint(query: string, params: unknown[] = []) {
  const error = await client.query(query, params).then(
    () => undefined,
    (reason: unknown) => reason as { constraint?: string },
  );
  return error?.constraint;
}

/** Parameters: host id, latitude, longitude. */
const insertActivity = `insert into activities (host_id, title, description, category, starts_at, location, capacity, latitude, longitude)
  values ($1, 'Встреча клуба', 'Обсудим планы на семестр', 'Общение', now() + interval '1 day', 'Главный корпус', 10, $2, $3)`;

let emailCounter = 0;
async function createUserWithoutProfile() {
  const { rows } = await client.query<{ id: string }>(
    `insert into users (email, password_hash) values ($1, 'hash') returning id`,
    [`user${++emailCounter}@example.test`],
  );
  return rows[0].id;
}

async function createUser(profile: Record<string, string> = {}) {
  const id = await createUserWithoutProfile();
  const columns = ['id', 'name', ...Object.keys(profile)];
  const values = [id, 'Студент', ...Object.values(profile)];
  await client.query(
    `insert into profiles (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    values,
  );
  return id;
}

describe('migrations', () => {
  it('apply every migration once and change nothing on a second run', async () => {
    const db = drizzle({ client });
    const folders = readdirSync(migrationsFolder, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
    expect(await countAppliedMigrations(db)).toBe(folders.length);

    await migrate(db, { migrationsFolder });
    expect(await countAppliedMigrations(db)).toBe(folders.length);
  });

  it('create the tables of the schema', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual(tables);
  });
});

describe('constraints', () => {
  it('keep emails lowercase and trimmed', async () => {
    expect(
      await violatedConstraint(
        `insert into users (email, password_hash) values ('Test@Example.com', 'hash')`,
      ),
    ).toBe('users_email_check');
  });

  it('require a company and no group from a partner', async () => {
    await expect(
      createUser({ account_kind: 'partner', company: 'Компания' }),
    ).resolves.toBeTruthy();
    expect(
      await violatedConstraint(
        `insert into profiles (id, name, account_kind) values ($1, 'Партнёр', 'partner')`,
        [await createUserWithoutProfile()],
      ),
    ).toBe('profiles_partner_check');
  });

  it('allow only known interests', async () => {
    expect(
      await violatedConstraint(
        `insert into profiles (id, name, interests) values ($1, 'Студент', '{Учёба,Кино}')`,
        [await createUserWithoutProfile()],
      ),
    ).toBe('profiles_interests_check');
  });

  it('require both coordinates or none', async () => {
    const host = await createUser();
    expect(await violatedConstraint(insertActivity, [host, 48.7, null])).toBe(
      'activities_coordinates_check',
    );
    expect(await violatedConstraint(insertActivity, [host, 48.7, 44.5])).toBeUndefined();
    expect(await violatedConstraint(insertActivity, [host, null, null])).toBeUndefined();
  });

  it('keep at most five photos per activity, each attached with a position', async () => {
    const owner = await createUser();
    const { rows } = await client.query<{ id: string }>(`${insertActivity} returning id`, [
      owner,
      null,
      null,
    ]);
    const activity = rows[0].id;
    const photo = `insert into photos (owner_id, activity_id, position, size_bytes) values ($1, $2, $3, 100)`;

    expect(await violatedConstraint(photo, [owner, activity, 5])).toBe('photos_position_check');
    expect(await violatedConstraint(photo, [owner, activity, 4])).toBeUndefined();
    expect(await violatedConstraint(photo, [owner, activity, 4])).toBe(
      'photos_activity_position_key',
    );
    expect(await violatedConstraint(photo, [owner, activity, null])).toBe('photos_attached_check');
    expect(await violatedConstraint(photo, [owner, null, 0])).toBe('photos_attached_check');
    expect(await violatedConstraint(photo, [owner, null, null])).toBeUndefined();
  });

  it('delete the profile with its user and keep the codes the user issued', async () => {
    const admin = await createUser();
    await client.query(
      `insert into partner_codes (code_hash, issued_by, expires_at) values ('\\x01', $1, now() + interval '7 days')`,
      [admin],
    );
    await client.query(`delete from users where id = $1`, [admin]);

    const profiles = await client.query(`select 1 from profiles where id = $1`, [admin]);
    expect(profiles.rows).toHaveLength(0);
    const codes = await client.query<{ issued_by: string | null }>(
      `select issued_by from partner_codes where code_hash = '\\x01'`,
    );
    expect(codes.rows).toEqual([{ issued_by: null }]);
  });
});
