import { test, expect } from '@playwright/test';

// Browser transport contract tests: no external account creation or email delivery
test('real auth UI: confirmation, failed login, session restore and server writes', async ({
  page,
}) => {
  const id = '00000000-0000-4000-8000-000000000001';
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'tester@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.test`;
  const session = {
    access_token: token,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user,
  };
  const snapshot = {
    version: 1,
    session: true,
    profile: {
      id,
      name: 'Никита',
      email: user.email,
      faculty: 'ИМИТ',
      course: '4',
      group: 'ПИ-231',
      bio: '',
      interests: [],
      theme: 'violet',
    },
    activities: [] as Record<string, unknown>[],
    organizations: [
      { id: '00000000-0000-4000-8000-000000000002', name: 'Код и кофе', description: '' },
    ],
    joinedIds: [] as string[],
    savedIds: [] as string[],
  };
  let wrongPassword = true;
  let created = false;
  let photoBytes: Buffer | null = null;
  let joinCalls = 0;
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api-maps.yandex.ru/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.ymaps={ready:function(fn){fn()},Map:function(){this.geoObjects={add:function(){}};this.events={add:function(name,fn){window.pickTestPoint=function(){fn({get:function(){return [48.7,44.5]}})}}}},Placemark:function(){this.geometry={setCoordinates:function(){}}}}`,
    }),
  );
  await page.route('https://*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname.startsWith('/storage/v1/object/unicore-events/')) {
      photoBytes = route.request().postDataBuffer();
      return route.fulfill({ json: { Key: url.pathname, Id: 'photo-id' } });
    }
    if (url.pathname === '/storage/v1/object/sign/unicore-events') {
      const body = route.request().postDataJSON();
      return route.fulfill({
        json: body.paths.map((path: string) => ({
          path,
          signedURL: `/object/sign/unicore-events/${path}?token=test`,
          error: null,
        })),
      });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/unicore-events/'))
      return route.fulfill({ contentType: 'image/jpeg', body: photoBytes! });
    if (url.pathname === '/rest/v1/unicore_profiles' && route.request().method() === 'PATCH') {
      snapshot.profile.theme = route.request().postDataJSON().theme;
      return route.fulfill({ json: { id } });
    }
    if (url.pathname === '/auth/v1/signup') return route.fulfill({ json: user });
    if (url.pathname === '/auth/v1/resend')
      return route.fulfill({
        status: 429,
        json: { msg: 'email rate limit exceeded' },
      });
    if (url.pathname === '/auth/v1/token') {
      if (wrongPassword)
        return route.fulfill({
          status: 400,
          headers: {
            'x-supabase-api-version': '2024-01-01',
            'access-control-expose-headers': 'x-supabase-api-version',
          },
          json: { code: 'invalid_credentials', msg: 'Invalid login credentials' },
        });
      return route.fulfill({ json: session });
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/rpc/unicore_snapshot')) return route.fulfill({ json: snapshot });
    if (url.pathname.endsWith('/rpc/unicore_create_event')) {
      const body = route.request().postDataJSON();
      created = true;
      snapshot.activities.unshift({
        id: 'meeting',
        kind: 'invite',
        title: body.p_title,
        description: body.p_description,
        category: body.p_category,
        startsAt: body.p_starts_at,
        location: body.p_location,
        capacity: body.p_capacity,
        priceRub: body.p_price_rub,
        coordinates:
          body.p_latitude === null
            ? null
            : { latitude: body.p_latitude, longitude: body.p_longitude },
        photoPaths: body.p_photo_paths,
        organizationId: body.p_organization_id,
        organizationName: snapshot.organizations.find((o) => o.id === body.p_organization_id)?.name,
        host: 'Никита',
        hostId: id,
        hostInfo: 'ИМИТ · 4 курс',
        attendees: 1,
        tags: [],
      });
      return route.fulfill({ json: 'meeting' });
    }
    if (url.pathname.endsWith('/rpc/unicore_set_saved')) {
      const body = route.request().postDataJSON();
      snapshot.savedIds = body.p_saved ? [body.p_activity_id] : [];
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith('/rpc/unicore_set_joined')) {
      joinCalls++;
      const body = route.request().postDataJSON();
      snapshot.joinedIds = body.p_joined ? [body.p_activity_id] : [];
      return route.fulfill({ status: 204 });
    }
    throw new Error(`Unexpected backend request ${url.pathname}`);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Попробовать без заполнения' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Никита');
  await page.getByLabel('Почта', { exact: true }).fill(user.email);
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Подтверди почту' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'События', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Отправить письмо ещё раз' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Лимит отправки писем исчерпан — попробуй позже',
  );
  await page.getByRole('button', { name: 'Перейти ко входу' }).click();
  await page.getByLabel('Пароль', { exact: true }).fill('test-password-123');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Неверная почта или пароль').first())
    .toBeVisible()
    .catch(async (error) => {
      console.log({ requests, errors, body: await page.locator('body').innerText() });
      throw error;
    });
  await page.getByRole('alert').click();
  await expect(page.getByText('Неверная почта или пароль', { exact: true })).toBeVisible();
  wrongPassword = false;
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^События$/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /^События$/ })).toBeVisible();
  await page.getByRole('tab', { name: 'События', exact: true }).click();
  await page.getByRole('button', { name: 'Создать событие', exact: true }).first().click();
  await page.getByLabel('Название', { exact: true }).fill('Наш первый общий инвайт');
  await page.getByLabel('Место', { exact: true }).fill('Главный корпус');
  await page.getByLabel('Описание', { exact: true }).fill('Познакомимся и обсудим будущие встречи');
  await page.getByRole('button', { name: 'Код и кофе', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Добавить фото', exact: true }).click();
  await (await chooser).setFiles(['assets/unicore-logo.png', 'assets/unicore-logo.png']);
  await expect(page.getByRole('button', { name: 'Добавить фото · 2/5' })).toBeVisible();
  await page.getByRole('switch', { name: 'Платное участие' }).click();
  await page.getByLabel('Стоимость за человека, ₽').fill('500');
  await page.getByRole('button', { name: 'Добавить точку на карте' }).click();
  const map = page.frameLocator('iframe');
  await map.locator('#map').waitFor();
  await expect
    .poll(() =>
      page
        .frames()
        .find((f) => f !== page.mainFrame())
        ?.evaluate(() => typeof (window as unknown as { pickTestPoint: unknown }).pickTestPoint),
    )
    .toBe('function');
  await page
    .frames()
    .find((f) => f !== page.mainFrame())!
    .evaluate(() => (window as unknown as { pickTestPoint: () => void }).pickTestPoint());
  await expect(page.getByText('48.70000, 44.50000')).toBeVisible();
  await page.getByRole('button', { name: 'Опубликовать событие', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Открыть: Наш первый общий инвайт', exact: true }),
  ).toBeVisible();
  expect(created).toBe(true);
  expect((photoBytes as Buffer | null)?.length).toBeGreaterThan(0);
  expect(snapshot.activities[0]).toMatchObject({
    priceRub: 500,
    organizationId: snapshot.organizations[0].id,
    organizationName: 'Код и кофе',
    coordinates: { latitude: 48.7, longitude: 44.5 },
  });
  await expect(page.getByRole('img', { name: 'Фото события 1' })).toBeVisible();
  await page.screenshot({ path: 'preview/posts-dark.png' });
  // View the same paid event as an attendee, verify consent precedes the write
  snapshot.activities[0].hostId = 'another-user';
  await page.reload();
  await page.getByRole('button', { name: 'Открыть: Наш первый общий инвайт' }).click();
  await expect(page.getByText('Код и кофе', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Участвовать · 500 ₽' }).click();
  expect(joinCalls).toBe(0);
  await expect(page.getByText('Запись не является оплатой', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  expect(joinCalls).toBe(0);
  await page.getByRole('button', { name: 'Участвовать · 500 ₽' }).click();
  await page.getByRole('button', { name: 'Записаться за 500 ₽' }).click();
  await expect(page.getByRole('button', { name: 'Отменить участие' })).toBeVisible();
  expect(joinCalls).toBe(1);
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('tab', { name: 'Профиль', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Профиль', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Тема: Светлая' }).click();
  await expect(page.getByRole('radio', { name: 'Тема: Светлая' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Тема: Светлая' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.screenshot({ path: 'preview/profile-light.png' });
  await expect(page.getByRole('button', { name: 'Сбросить демоданные' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Выйти из профиля', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  await page.goto('/create');
  await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
