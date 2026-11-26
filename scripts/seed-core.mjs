import { createHash } from 'node:crypto';

export function seedId(namespace, type, key) {
  const bytes = createHash('sha1').update(`${namespace}:${type}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const categories = ['Учёба', 'Карьера', 'Спорт', 'Общение', 'Творчество'];
function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function text(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}
function indexRows(rows, kind) {
  requireValue(Array.isArray(rows) && rows.length <= 200, `Неверный список: ${kind}`);
  const map = new Map();
  for (const row of rows) {
    requireValue(row && /^[a-z0-9-]{1,50}$/.test(row.key), `Неверный ключ: ${kind}`);
    requireValue(!map.has(row.key), `Повторяющийся ключ ${kind}: ${row.key}`);
    map.set(row.key, row);
  }
  return map;
}
export function buildSeedPlan(fixture, startDate) {
  const ns = fixture.namespace;
  requireValue(
    typeof ns === 'string' && /^unicore-[a-z0-9-]{1,40}$/.test(ns),
    'Неверное пространство имён набора',
  );
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
      new Date(`${startDate}T00:00:00Z`).toISOString().slice(0, 10) === startDate,
    'Дата должна быть в формате ГГГГ-ММ-ДД',
  );
  const users = indexRows(fixture.users, 'users');
  const organizations = indexRows(fixture.organizations, 'organizations');
  const events = indexRows(fixture.events, 'events');
  const marker = (type, key) => `${ns}:${type}:${key}`;
  const id = (type, key) => seedId(ns, type, key);
  const emails = new Set();
  const authUsers = [...users.values()].map((u) => {
    requireValue(
      text(u.name, 1, 40) && /^[^\s@]+@example\.com$/.test(u.email),
      `Неверное имя или тестовая почта: ${u.key}`,
    );
    requireValue(!emails.has(u.email.toLowerCase()), `Повторяющаяся почта: ${u.email}`);
    emails.add(u.email.toLowerCase());
    requireValue(
      text(u.faculty, 0, 80) &&
        /^[1-6]$/.test(u.course) &&
        text(u.group, 0, 20) &&
        text(u.bio, 0, 300),
      `Неверный профиль: ${u.key}`,
    );
    requireValue(
      Array.isArray(u.interests) &&
        u.interests.every((c) => categories.includes(c)) &&
        ['violet', 'forest', 'light'].includes(u.theme),
      `Неверные интересы или тема: ${u.key}`,
    );
    return {
      id: id('users', u.key),
      email: u.email.toLowerCase(),
      name: u.name,
      seedKey: marker('users', u.key),
    };
  });
  const profiles = [...users.values()].map((u) => ({
    id: id('users', u.key),
    name: u.name,
    faculty: u.faculty,
    course: u.course,
    group_name: u.group,
    bio: u.bio,
    interests: u.interests,
    theme: u.theme,
    seed_key: marker('users', u.key),
  }));
  const orgRows = [...organizations.values()].map((o) => {
    requireValue(
      users.has(o.owner) && text(o.name, 2, 80) && text(o.description, 0, 500),
      `Неверная организация: ${o.key}`,
    );
    return {
      id: id('organizations', o.key),
      owner_id: id('users', o.owner),
      name: o.name,
      description: o.description,
      seed_key: marker('organizations', o.key),
    };
  });
  const activities = [...events.values()].map((e) => {
    requireValue(
      users.has(e.host) &&
        text(e.title, 5, 80) &&
        text(e.description, 15, 1500) &&
        text(e.location, 3, 120) &&
        categories.includes(e.category),
      `Неверное событие: ${e.key}`,
    );
    requireValue(
      !e.organization || organizations.get(e.organization)?.owner === e.host,
      `Организатор не владеет сообществом: ${e.key}`,
    );
    requireValue(
      Number.isInteger(e.capacity) &&
        e.capacity >= 2 &&
        e.capacity <= 100 &&
        Number.isInteger(e.priceRub) &&
        e.priceRub >= 0 &&
        e.priceRub <= 1000000,
      `Неверная вместимость или цена: ${e.key}`,
    );
    requireValue(
      Number.isInteger(e.daysFromStart) &&
        e.daysFromStart >= 1 &&
        e.daysFromStart <= 365 &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e.time),
      `Неверная дата: ${e.key}`,
    );
    const point = e.coordinates;
    requireValue(
      !point ||
        (Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          Math.abs(point.latitude) <= 90 &&
          Math.abs(point.longitude) <= 180),
      `Неверная геометка: ${e.key}`,
    );
    const date = new Date(`${startDate}T${e.time}:00+03:00`);
    date.setUTCDate(date.getUTCDate() + e.daysFromStart);
    return {
      id: id('events', e.key),
      host_id: id('users', e.host),
      organization_id: e.organization ? id('organizations', e.organization) : null,
      kind: 'event',
      title: e.title,
      description: e.description,
      category: e.category,
      location: e.location,
      starts_at: date.toISOString(),
      capacity: e.capacity,
      price_rub: e.priceRub,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      tags: [],
      photo_paths: [],
      seed_key: marker('events', e.key),
    };
  });
  return { namespace: ns, authUsers, profiles, organizations: orgRows, activities };
}

// Refuse deterministic ID collisions instead of adopting somebody else's data
export function verifySeedOwnership(existing, desired, label) {
  const expected = new Map(desired.map((row) => [row.id, row.seed_key]));
  for (const row of existing)
    requireValue(
      expected.get(row.id) === row.seed_key,
      `Конфликт с существующей записью ${label}: ${row.id}`,
    );
}
export async function applySeedRows(client, plan, { refreshDates = false } = {}) {
  const groups = [
    ['unicore_profiles', plan.profiles],
    ['unicore_organizations', plan.organizations],
    ['unicore_activities', plan.activities],
  ];
  const existingByTable = new Map();
  // Validate every table before the first table write
  for (const [table, rows] of groups) {
    if (!rows.length) {
      existingByTable.set(table, []);
      continue;
    }
    const { data, error } = await client
      .from(table)
      .select('id,seed_key')
      .in(
        'id',
        rows.map((r) => r.id),
      );
    if (error) throw new Error(`Проверка ${table}: ${error.message}`);
    verifySeedOwnership(data || [], rows, table);
    existingByTable.set(table, data || []);
  }
  const counts = {};
  for (const [table, rows] of groups) {
    counts[table] = rows.length - existingByTable.get(table).length;
    if (!rows.length) continue;
    const { error } = await client
      .from(table)
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`Заполнение ${table}: ${error.message}`);
  }
  if (refreshDates) {
    for (const row of plan.activities) {
      const { error } = await client
        .from('unicore_activities')
        .update({ starts_at: row.starts_at })
        .eq('id', row.id)
        .eq('seed_key', row.seed_key);
      if (error) throw new Error(`Обновление даты: ${error.message}`);
    }
  }
  return counts;
}
