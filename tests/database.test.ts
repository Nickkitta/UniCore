import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const users = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
];
let db: PGlite;
async function asUser<T>(index: number, sql: string, params: unknown[] = []) {
  await db.exec('set role authenticated');
  try {
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: users[index], email: `user${index}@example.test` }),
    ]);
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}
async function invite(capacity = 2) {
  const result = await asUser<{ id: string }>(
    0,
    "select public.unicore_create_invite('Встреча студентов','Обсудим планы и познакомимся друг с другом','Общение',now()+interval '1 day','Главный корпус',$1) as id",
    [capacity],
  );
  return result.rows[0].id;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,delete on storage.objects to authenticated;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.jwt(),auth.uid() to authenticated,anon;
  `);
  for (const [index, id] of users.entries()) {
    await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
      id,
      JSON.stringify({ name: `Студент ${index}` }),
    ]);
  }
  await db.exec(await readFile('supabase/migrations/202611120001_unicore.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202611120002_event_posts.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202611120003_organizations.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/202611200001_event_rooms.sql', 'utf8'));
  for (let i = 0; i < 3; i++) await asUser(i, 'select public.unicore_snapshot()');
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe('PostgreSQL migration and permissions', () => {
  it('restricts invites to admins, consumes them on signup and limits partner participation', async () => {
    const partner = '00000000-0000-4000-8000-000000000004';
    const other = '00000000-0000-4000-8000-000000000005';
    const issue = 'select public.unicore_issue_partner_code() code';
    await expect(asUser(1, issue)).rejects.toThrow();
    await expect(
      asUser(1, 'insert into public.unicore_admins values($1)', [users[1]]),
    ).rejects.toThrow();
    await expect(
      asUser(1, "update public.unicore_profiles set account_kind='partner' where id=$1", [
        users[1],
      ]),
    ).rejects.toThrow();
    await db.query('insert into public.unicore_admins values($1)', [users[0]]);
    const { code } = (await asUser<{ code: string }>(0, issue)).rows[0];
    const signup = (id: string, token: string, company: string) =>
      db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)', [
        id,
        JSON.stringify({ name: 'Лена', company, partner_code: token }),
      ]);
    await expect(signup(partner, 'wrong', 'Студия')).rejects.toThrow('UNICORE_INVALID_CODE');
    await expect(signup(partner, code, '')).rejects.toThrow();
    await signup(partner, code, 'Студия');
    await expect(signup(other, code, 'Клуб')).rejects.toThrow('UNICORE_INVALID_CODE');
    const expired = (await asUser<{ code: string }>(0, issue)).rows[0].code;
    await db.exec(
      "update public.unicore_partner_codes set expires_at=now()-interval '1 day' where used_at is null",
    );
    await expect(signup(other, expired, 'Клуб')).rejects.toThrow('UNICORE_INVALID_CODE');
    users.push(partner);
    try {
      const id = await invite();
      await expect(asUser(3, 'select public.unicore_set_joined($1,true)', [id])).rejects.toThrow(
        'UNICORE_PARTNER_JOIN',
      );
      const publish =
        "select public.unicore_create_partner_event('Открытая студия','Встреча с дизайнерами компании','Карьера',now()+interval '1 day','Студия',2,0,null,null,'{}','{}','Экскурсия') id";
      await expect(asUser(1, publish)).rejects.toThrow();
      const post = (await asUser<{ id: string }>(3, publish)).rows[0].id;
      const snapshot = (
        await asUser<{
          s: {
            profile: { accountKind: string; group: string };
            activities: { id: string; partnerBadge: string; attendees: number }[];
          };
        }>(3, 'select public.unicore_snapshot() s')
      ).rows[0].s;
      expect(snapshot.profile).toMatchObject({
        accountKind: 'partner',
        company: 'Студия',
        group: '',
        isAdmin: false,
      });
      expect(snapshot.activities.find((item) => item.id === post)).toMatchObject({
        partnerBadge: 'Экскурсия',
        attendees: 0,
        organizationName: 'Студия',
      });
      for (const student of [0, 1])
        await asUser(student, 'select public.unicore_set_joined($1,true)', [post]);
      await expect(asUser(2, 'select public.unicore_set_joined($1,true)', [post])).rejects.toThrow(
        'UNICORE_FULL',
      );
    } finally {
      users.pop();
    }
  });
  it('limits delegated moderation to one event and removes it on revocation or departure', async () => {
    const first = await invite(4),
      second = await invite(4);
    for (const event of [first, second])
      for (const person of [1, 2])
        await asUser(person, 'select public.unicore_set_joined($1,true)', [event]);
    const assign = (actor: number, event: string, target: number, enabled: boolean) =>
      asUser(actor, 'select public.unicore_set_cohost($1,$2,$3)', [event, users[target], enabled]);
    const kick = (event: string, target: number) =>
      asUser(1, 'select public.unicore_remove_member($1,$2)', [event, users[target]]);
    const read = async () =>
      (
        await asUser<{ room: { isCohost: boolean; members: unknown[] } }>(
          1,
          'select public.unicore_room($1) room',
          [first],
        )
      ).rows[0].room;
    await expect(assign(1, first, 1, true)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await assign(0, first, 1, true);
    expect((await read()).members).toHaveLength(2);
    await expect(assign(1, first, 2, true)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await expect(kick(second, 2)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await expect(kick(first, 0)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await assign(0, first, 2, true);
    await expect(kick(first, 2)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await assign(0, first, 2, false);
    await assign(0, first, 1, false);
    expect((await read()).members).toEqual([]);
    await expect(kick(first, 2)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await assign(0, first, 1, true);
    await kick(first, 2);
    await asUser(1, 'select public.unicore_set_joined($1,false)', [first]);
    await asUser(1, 'select public.unicore_set_joined($1,true)', [first]);
    expect((await read()).isCohost).toBe(false);
  });
  it('keeps the roster private and revokes event, chat, save and join access after removal', async () => {
    const id = await invite(3);
    await asUser(1, 'select public.unicore_set_joined($1,true)', [id]);
    await asUser(1, 'select public.unicore_set_saved($1,true)', [id]);
    await asUser(1, "select public.unicore_post_message($1,'Встречаемся у входа?')", [id]);
    const room = async (index: number) =>
      (
        await asUser<{ r: { members: { id: string }[]; messages: { body: string }[] } }>(
          index,
          'select public.unicore_room($1) as r',
          [id],
        )
      ).rows[0].r;
    expect((await room(0)).members.map((member) => member.id)).toEqual([users[1]]);
    expect((await room(1)).members).toEqual([]);
    expect((await room(1)).messages[0].body).toBe('Встречаемся у входа?');
    await expect(room(2)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await expect(
      asUser(2, 'select public.unicore_remove_member($1,$2)', [id, users[1]]),
    ).rejects.toThrow('UNICORE_ROOM_DENIED');
    await asUser(0, 'select public.unicore_remove_member($1,$2)', [id, users[1]]);
    expect((await room(0)).members).toEqual([]);
    await expect(room(1)).rejects.toThrow('UNICORE_ROOM_DENIED');
    await expect(
      asUser(1, "select public.unicore_post_message($1,'После удаления')", [id]),
    ).rejects.toThrow('UNICORE_ROOM_DENIED');
    for (const action of ['joined', 'saved'])
      await expect(asUser(1, `select public.unicore_set_${action}($1,true)`, [id])).rejects.toThrow(
        'UNICORE_NOT_FOUND',
      );
    expect(
      (await asUser(1, 'select id from public.unicore_activities where id=$1', [id])).rows,
    ).toEqual([]);
    expect(
      JSON.stringify((await asUser(1, 'select public.unicore_snapshot()')).rows),
    ).not.toContain(id);
    await asUser(2, 'select public.unicore_set_joined($1,true)', [id]);
  });
  it('validates the institute/group pair and the controlled tags on publication', async () => {
    await asUser(
      0,
      "update public.unicore_profiles set faculty='ИМИТ',group_name='ПИ-231' where id=$1",
      [users[0]],
    );
    await expect(
      asUser(0, "update public.unicore_profiles set faculty='ИЕН' where id=$1", [users[0]]),
    ).rejects.toThrow('UNICORE_INVALID_GROUP');
    const sql =
      "select public.unicore_create_tagged_event('Вечер кино','Смотрим и обсуждаем фильмы','Общение', now()+interval '1 day','Актовый зал',6,0,null,null,'{}',$1) as id";
    const id = (await asUser<{ id: string }>(0, sql, [['Кино', 'Знакомства']])).rows[0].id;
    expect(
      (
        await asUser<{ tags: string[] }>(
          1,
          'select tags from public.unicore_activities where id=$1',
          [id],
        )
      ).rows[0].tags,
    ).toEqual(['Кино', 'Знакомства']);
    await expect(asUser(0, sql, [['произвольный тег']])).rejects.toThrow('UNICORE_INVALID_TAGS');
  });
  it('allows only organization owners to publish on its behalf and protects seed markers', async () => {
    const org = '10000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into public.unicore_organizations(id,owner_id,name,seed_key) values($1,$2,'Студенческий клуб','test:org')",
      [org, users[0]],
    );
    await expect(
      asUser(1, "insert into public.unicore_organizations(owner_id,name) values($1,'Чужой клуб')", [
        users[1],
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(0, "update public.unicore_profiles set seed_key='claim' where id=$1", [users[0]]),
    ).rejects.toThrow(/permission denied/i);
    const sql =
      "select public.unicore_create_event('Встреча сообщества','Обсудим планы студенческого клуба','Общение',now()+interval '1 day','Главный корпус',8,0,null,null,'{}',$1) as id";
    await expect(asUser(1, sql, [org])).rejects.toThrow('UNICORE_ORGANIZATION_FORBIDDEN');
    const { rows } = await asUser<{ id: string }>(0, sql, [org]);
    const state = await asUser<{
      s: {
        activities: { id: string; organizationName: string }[];
        organizations: { id: string }[];
      };
    }>(1, 'select public.unicore_snapshot() as s');
    expect(state.rows[0].s.activities.find((a) => a.id === rows[0].id)?.organizationName).toBe(
      'Студенческий клуб',
    );
    expect(state.rows[0].s.organizations).toEqual([]);
    const owner = await asUser<{ s: { organizations: { id: string }[] } }>(
      0,
      'select public.unicore_snapshot() as s',
    );
    expect(owner.rows[0].s.organizations).toEqual([expect.objectContaining({ id: org })]);
  });
  it('stores price, optional coordinates, photos and account theme with ownership checks', async () => {
    const path = `${users[0]}/event-photo.jpg`;
    await asUser(0, "insert into storage.objects(bucket_id,name) values('unicore-events',$1)", [
      path,
    ]);
    expect((await asUser(1, 'select * from storage.objects where name=$1', [path])).rows).toEqual(
      [],
    );
    await expect(
      asUser(1, "insert into storage.objects(bucket_id,name) values('unicore-events',$1)", [path]),
    ).rejects.toThrow();
    const sql =
      "select public.unicore_create_event('Платная встреча','Обсудим планы и познакомимся','Общение',now()+interval '1 day','Главный корпус',5,$1,$2,$3,$4) as id";
    await expect(asUser(1, sql, [500, 48.7, 44.5, [path]])).rejects.toThrow(
      'UNICORE_INVALID_PHOTOS',
    );
    await expect(asUser(0, sql, [-1, null, null, []])).rejects.toThrow(/check constraint/i);
    await expect(asUser(0, sql, [500, 91, 44.5, []])).rejects.toThrow(/check constraint/i);
    await expect(asUser(0, sql, [500, 48.7, null, []])).rejects.toThrow(/check constraint/i);
    await expect(asUser(0, sql, [500, null, null, Array(6).fill(path)])).rejects.toThrow(
      'UNICORE_INVALID_PHOTOS',
    );
    const created = await asUser<{ id: string }>(0, sql, [500, 48.7, 44.5, [path]]);
    expect(
      (await asUser(1, 'select * from storage.objects where name=$1', [path])).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(0, 'delete from storage.objects where name=$1 returning id', [path])).rows,
    ).toEqual([]);
    await asUser(0, "update public.unicore_profiles set theme='light' where id=$1", [users[0]]);
    expect(
      (
        await asUser(
          1,
          "update public.unicore_profiles set theme='forest' where id=$1 returning id",
          [users[0]],
        )
      ).rows,
    ).toEqual([]);
    const snapshot = await asUser<{
      s: {
        profile: { theme: string };
        activities: { id: string; priceRub: number; coordinates: unknown; photoPaths: string[] }[];
      };
    }>(0, 'select public.unicore_snapshot() as s');
    expect(snapshot.rows[0].s.profile.theme).toBe('light');
    expect(snapshot.rows[0].s.activities.find((a) => a.id === created.rows[0].id)).toMatchObject({
      priceRub: 500,
      coordinates: { latitude: 48.7, longitude: 44.5 },
      photoPaths: [path],
    });
  });
  it('denies anonymous reads and RPC calls', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from public.unicore_activities')).rejects.toThrow(
        /permission denied/i,
      );
      await expect(db.query('select public.unicore_snapshot()')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await db.exec('reset role');
    }
  });
  it('prevents reading or changing another profile and changing profile ownership', async () => {
    expect(
      (await asUser(1, 'select * from public.unicore_profiles where id=$1', [users[0]])).rows,
    ).toEqual([]);
    expect(
      (
        await asUser(
          1,
          "update public.unicore_profiles set name='Чужое имя' where id=$1 returning id",
          [users[0]],
        )
      ).rows,
    ).toEqual([]);
    await expect(
      asUser(1, 'update public.unicore_profiles set id=$1 where id=$2', [users[0], users[1]]),
    ).rejects.toThrow(/permission denied/i);
    expect(
      (
        await asUser(
          1,
          "update public.unicore_profiles set bio='Мой профиль' where id=$1 returning bio",
          [users[1]],
        )
      ).rows,
    ).toEqual([{ bio: 'Мой профиль' }]);
  });
  it('enforces capacity, idempotent joins, cancellation and host ownership', async () => {
    const id = await invite();
    await asUser(1, 'select public.unicore_set_joined($1,true)', [id]);
    await asUser(1, 'select public.unicore_set_joined($1,true)', [id]);
    await expect(asUser(2, 'select public.unicore_set_joined($1,true)', [id])).rejects.toThrow(
      'UNICORE_FULL',
    );
    await expect(asUser(0, 'select public.unicore_set_joined($1,false)', [id])).rejects.toThrow(
      'UNICORE_HOST',
    );
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from public.unicore_participants where activity_id=$1',
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    await asUser(1, 'select public.unicore_set_joined($1,false)', [id]);
    await asUser(1, 'select public.unicore_set_joined($1,false)', [id]);
    await asUser(2, 'select public.unicore_set_joined($1,true)', [id]);
    await expect(
      asUser(1, 'insert into public.unicore_participants(activity_id,user_id) values($1,$2)', [
        id,
        users[1],
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
  it('returns accurate counts without leaking other users private details', async () => {
    const id = await invite(4);
    await asUser(1, 'select public.unicore_set_joined($1,true)', [id]);
    const { rows } = await asUser<{
      s: {
        profile: { id: string; email: string };
        activities: { id: string; attendees: number }[];
        joinedIds: string[];
      };
    }>(1, 'select public.unicore_snapshot() as s');
    expect(rows[0].s.activities.find((a) => a.id === id)?.attendees).toBe(1);
    expect(rows[0].s.joinedIds).toContain(id);
    expect(rows[0].s.profile.id).toBe(users[1]);
    expect(JSON.stringify(rows[0].s)).not.toContain('user0@example.test');
    expect(
      (await asUser(2, 'select * from public.unicore_participants where activity_id=$1', [id]))
        .rows,
    ).toEqual([]);
  });
  it('keeps saved items private and rejects invalid or past invitations', async () => {
    const id = await invite();
    await asUser(1, 'select public.unicore_set_saved($1,true)', [id]);
    await asUser(1, 'select public.unicore_set_saved($1,true)', [id]);
    expect(
      (await asUser(1, 'select * from public.unicore_saved where activity_id=$1', [id])).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(2, 'select * from public.unicore_saved where activity_id=$1', [id])).rows,
    ).toEqual([]);
    await expect(invite(101)).rejects.toThrow(/check constraint/i);
    await expect(
      asUser(
        0,
        "select public.unicore_create_invite('Старая встреча','Достаточно длинное описание','Спорт',now()-interval '1 day','Корпус',4)",
      ),
    ).rejects.toThrow('UNICORE_PAST');
    await expect(asUser(1, 'select public.unicore_set_joined($1,null)', [id])).rejects.toThrow(
      'UNICORE_INVALID_INPUT',
    );
  });
});
