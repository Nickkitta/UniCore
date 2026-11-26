import { expect, test } from '@playwright/test';
import { createSeed } from '../../src/data/seed';

test('partner email survives logout, can be forgotten and never restores the password', async ({
  page,
}) => {
  const email = 'partner@example.test';
  const user = {
    id: '00000000-0000-4000-8000-000000000007',
    email,
    user_metadata: {},
    app_metadata: {},
    aud: 'authenticated',
    role: 'authenticated',
    created_at: new Date().toISOString(),
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token =
    encode({ alg: 'HS256', typ: 'JWT' }) +
    '.' +
    encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }) +
    '.test';
  await page.route('https://*.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token'))
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: 'test-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        },
      });
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (path.endsWith('/unicore_snapshot')) {
      const state = createSeed();
      return route.fulfill({
        json: {
          ...state,
          session: true,
          profile: {
            ...state.profile,
            id: user.id,
            email,
            accountKind: 'partner',
            company: 'Студия',
          },
        },
      });
    }
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Партнёр', exact: true }).click();
  await page.getByLabel('Почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('sample-password');
  await page.getByLabel('Запомнить почту на устройстве').check();
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'События', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await page.getByRole('button', { name: 'Выйти из профиля' }).click();
  await expect(page.getByLabel('Почта', { exact: true })).toHaveValue(email);
  await expect(page.getByRole('heading', { name: 'Кабинет партнёра' })).toBeVisible();
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveValue('');
  await page.getByLabel('Запомнить почту на устройстве').uncheck();
  await page.reload();
  await expect(page.getByLabel('Почта', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Твои люди рядом' })).toBeVisible();
});
