import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { applySeedRows, buildSeedPlan } from '../scripts/seed-core.mjs';
const fixture = JSON.parse(
  await readFile(new URL('../supabase/seeds/starter.json', import.meta.url), 'utf8'),
);
function fakeClient() {
  const tables = new Map(
    ['unicore_profiles', 'unicore_organizations', 'unicore_activities'].map((t) => [t, new Map()]),
  );
  const client = {
    from(table) {
      const rows = tables.get(table);
      return {
        select() {
          return {
            in: async (_, ids) => ({
              data: [...rows.values()].filter((r) => ids.includes(r.id)).map((r) => ({ ...r })),
              error: null,
            }),
          };
        },
        async upsert(incoming, options) {
          expect(options.ignoreDuplicates).toBe(true);
          for (const row of incoming) if (!rows.has(row.id)) rows.set(row.id, structuredClone(row));
          return { error: null };
        },
        update(values) {
          return {
            eq: (_, id) => ({
              eq: async (_, key) => {
                const row = rows.get(id);
                if (row?.seed_key === key) Object.assign(row, values);
                return { error: null };
              },
            }),
          };
        },
      };
    },
  };
  return { client, tables };
}
describe('cloud seed plan', () => {
  it('builds linked records with stable IDs and dates relative to Volgograd', () => {
    const a = buildSeedPlan(fixture, '2026-11-12'),
      b = buildSeedPlan(fixture, '2027-01-01');
    expect(a.authUsers).toHaveLength(12);
    expect(a.organizations).toHaveLength(4);
    expect(a.activities).toHaveLength(16);
    expect(a.activities.map((x) => x.id)).toEqual(b.activities.map((x) => x.id));
    expect(a.activities[0].starts_at).toBe('2026-11-13T15:00:00.000Z');
    expect(a.organizations[0].owner_id).toBe(a.authUsers[0].id);
    expect(a.activities[0].organization_id).toBe(a.organizations[0].id);
  });
  it('does not duplicate or overwrite data on rerun, refresh changes only seeded dates', async () => {
    const { client, tables } = fakeClient();
    const plan = buildSeedPlan(fixture, '2026-11-12');
    await applySeedRows(client, plan);
    const event = tables.get('unicore_activities').get(plan.activities[0].id);
    event.title = 'Изменено в тесте';
    tables
      .get('unicore_activities')
      .set('real-user-event', {
        id: 'real-user-event',
        title: 'Личное событие',
        starts_at: '2026-12-01',
        seed_key: null,
      });
    const second = buildSeedPlan(fixture, '2027-01-01');
    expect(await applySeedRows(client, second)).toEqual({
      unicore_profiles: 0,
      unicore_organizations: 0,
      unicore_activities: 0,
    });
    expect(event.starts_at).toBe(plan.activities[0].starts_at);
    expect(event.title).toBe('Изменено в тесте');
    await applySeedRows(client, second, { refreshDates: true });
    expect(event.starts_at).toBe(second.activities[0].starts_at);
    expect(event.title).toBe('Изменено в тесте');
    expect(tables.get('unicore_activities').get('real-user-event').starts_at).toBe('2026-12-01');
    expect(tables.get('unicore_activities').size).toBe(17);
  });
  it('refuses ownership collisions before any app table write', async () => {
    const { client, tables } = fakeClient();
    const plan = buildSeedPlan(fixture, '2026-11-12');
    tables
      .get('unicore_activities')
      .set(plan.activities[0].id, { id: plan.activities[0].id, seed_key: null });
    await expect(applySeedRows(client, plan)).rejects.toThrow('Конфликт');
    expect(tables.get('unicore_profiles').size).toBe(0);
  });
  it('rejects invalid relationships, duplicates and unsafe seed email domains', () => {
    const wrong = structuredClone(fixture);
    wrong.events[0].host = 'anna';
    expect(() => buildSeedPlan(wrong, '2026-11-12')).toThrow('не владеет');
    const duplicate = structuredClone(fixture);
    duplicate.users.push(duplicate.users[0]);
    expect(() => buildSeedPlan(duplicate, '2026-11-12')).toThrow('Повторяющийся ключ');
    const email = structuredClone(fixture);
    email.users[0].email = 'real@gmail.com';
    expect(() => buildSeedPlan(email, '2026-11-12')).toThrow('тестовая почта');
  });
});
