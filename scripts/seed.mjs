import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { applySeedRows, buildSeedPlan, verifySeedOwnership } from './seed-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Нет значения ${name}`);
  return args[i + 1];
}
async function main() {
  const known = new Set(['--dry-run', '--refresh-dates', '--file', '--start-date']);
  for (let i = 0; i < args.length; i++) {
    if (!known.has(args[i])) throw new Error(`Неизвестный параметр ${args[i]}`);
    if (['--file', '--start-date'].includes(args[i])) i++;
  }
  const fixturePath = path.resolve(root, option('--file', 'supabase/seeds/starter.json'));
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Volgograd',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const plan = buildSeedPlan(
    JSON.parse(await readFile(fixturePath, 'utf8')),
    option('--start-date', today),
  );
  console.log(
    `Набор ${plan.namespace}: ${plan.authUsers.length} пользователей, ${plan.organizations.length} организаций, ${plan.activities.length} событий`,
  );
  if (args.includes('--dry-run')) {
    console.table(
      plan.activities.map((e) => ({
        событие: e.title,
        дата: e.starts_at,
        цена: e.price_rub,
        мест: e.capacity,
      })),
    );
    console.log('Предпросмотр завершён, запросы к серверу не выполнялись');
    return;
  }
  const configPath = path.join(root, '.env.seed.local');
  const config = {
    ...(existsSync(configPath) ? parseEnv(await readFile(configPath, 'utf8')) : {}),
    ...process.env,
  };
  const url = config.SUPABASE_SEED_URL,
    key = config.SUPABASE_SEED_ADMIN_KEY;
  if (!url || !key)
    throw new Error(
      'Заполни SUPABASE_SEED_URL и SUPABASE_SEED_ADMIN_KEY в .env.seed.local — ключ нужен только этому серверному скрипту',
    );
  if (key.startsWith('sb_publishable_'))
    throw new Error(
      'Нужен secret/service_role ключ, публичный ключ не может создавать тестовые аккаунты',
    );
  const target = new URL(url);
  if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Неверный адрес Supabase');
  console.log(`Проект: ${target.host}`);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Schema and ownership preflight happens before creating any Auth accounts
  for (const [table, rows] of [
    ['unicore_profiles', plan.profiles],
    ['unicore_organizations', plan.organizations],
    ['unicore_activities', plan.activities],
  ]) {
    if (!rows.length) continue;
    const { data, error } = await client
      .from(table)
      .select('id,seed_key')
      .in(
        'id',
        rows.map((r) => r.id),
      );
    if (error)
      throw new Error(
        `Не удалось прочитать ${table} — проверь ключ и применение миграции 202611120003_organizations.sql`,
      );
    verifySeedOwnership(data || [], rows, table);
  }
  const existingUsers = new Map();
  for (const user of plan.authUsers) {
    const { data, error } = await client.auth.admin.getUserById(user.id);
    if (error && error.status !== 404 && error.code !== 'user_not_found')
      throw new Error(`Не удалось проверить тестовый аккаунт ${user.email}: ${error.message}`);
    if (data?.user) {
      if (
        data.user.app_metadata?.unicore_seed_key !== user.seedKey ||
        data.user.email?.toLowerCase() !== user.email
      )
        throw new Error(`Конфликт с существующим аккаунтом ${user.email} — он не будет изменён`);
      existingUsers.set(user.id, data.user);
    }
  }
  const localDir = path.join(root, '.local', 'unicore-seed');
  await mkdir(localDir, { recursive: true });
  const accountsPath = path.join(
    localDir,
    `${target.host.replace(/[^a-z0-9.-]/gi, '_')}.${plan.namespace}.accounts.json`,
  );
  const journal = existsSync(accountsPath)
    ? JSON.parse(await readFile(accountsPath, 'utf8'))
    : { project: url, namespace: plan.namespace, accounts: [] };
  const save = () =>
    writeFile(accountsPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  let created = 0;
  for (const user of plan.authUsers) {
    let account = journal.accounts.find((a) => a.id === user.id);
    if (existingUsers.has(user.id)) {
      // Recover a successful Auth write whose following journal save was interrupted
      if (account?.status === 'pending') {
        account.status = 'created';
        await save();
      }
      continue;
    }
    if (!account) {
      account = {
        id: user.id,
        email: user.email,
        password: `Uc!${randomBytes(18).toString('base64url')}9aA`,
        status: 'pending',
      };
      journal.accounts.push(account);
    }
    await save();
    const { error } = await client.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { name: user.name },
      app_metadata: { unicore_seed_key: user.seedKey, unicore_seed: plan.namespace },
    });
    if (error) throw new Error(`Создание ${user.email}: ${error.message}`);
    account.status = 'created';
    created++;
    await save();
  }
  const counts = await applySeedRows(client, plan, {
    refreshDates: args.includes('--refresh-dates'),
  });
  console.log(`Создано аккаунтов: ${created}`);
  console.log(
    `Добавлено профилей: ${counts.unicore_profiles}, организаций: ${counts.unicore_organizations}, событий: ${counts.unicore_activities}`,
  );
  if (args.includes('--refresh-dates')) console.log('Даты событий этого набора обновлены');
  console.log(`Доступы к созданным аккаунтам: ${accountsPath}`);
  console.log('Пароли существующих аккаунтов и пользовательские события не изменялись');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Не удалось заполнить проект');
  process.exitCode = 1;
});
