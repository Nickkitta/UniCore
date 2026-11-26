import { test, expect, Page } from '@playwright/test';

async function openTab(page: Page, name: string) {
  const targets: Record<string, { path: RegExp; heading: RegExp }> = {
    События: { path: /\/$/, heading: /^События$/ },
    'Мои планы': { path: /\/plans$/, heading: /^Мои планы$/ },
    Профиль: { path: /\/profile$/, heading: /^Профиль$/ },
  };
  await page.getByRole('tab', { name, exact: true }).click();
  await expect(page).toHaveURL(targets[name].path);
  await expect(page.getByRole('heading', { name: targets[name].heading })).toBeVisible();
}

test('mobile demo: validation, auth, discovery, join, persistence, create, edit and sign out', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Войти по почте · демо', exact: true }).click();
  await expect(page.getByText('Введи почту в формате name@example.com')).toBeVisible();
  await page.screenshot({ path: 'preview/sign-in.png', fullPage: true });
  await page.getByRole('button', { name: 'Попробовать без заполнения', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'События', exact: true })).toBeVisible();
  await page.screenshot({ path: 'preview/campus.png' });
  await page.getByLabel('Поиск', { exact: true }).fill('несуществующее событие');
  await expect(page.getByText('Пока нет событий')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await openTab(page, 'События');
  await page.getByRole('button', { name: 'Открыть: Волейбол после пар', exact: true }).click();
  await page.getByRole('button', { name: 'Участвовать', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Отменить участие', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Чат встречи', exact: true }).click();
  await page.getByLabel('Сообщение участникам').fill('До встречи в зале');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText('До встречи в зале', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить событие', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Отменить участие', exact: true })).toBeVisible();
  await page.screenshot({ path: 'preview/detail.png', fullPage: true });
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await openTab(page, 'Мои планы');
  await expect(page.getByRole('button', { name: 'Открыть: Волейбол после пар' })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранённое', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Открыть: Волейбол после пар' })).toBeVisible();
  await openTab(page, 'События');
  await page.getByRole('button', { name: 'Открыть: Разберём матан вместе' }).click();
  await expect(page.getByRole('button', { name: 'Мест нет', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByRole('button', { name: 'Создать событие', exact: true }).click();
  await page.getByRole('button', { name: 'Опубликовать событие', exact: true }).click();
  await expect(page.getByText('Добавь название от 5 символов')).toBeVisible();
  await page.getByLabel('Название', { exact: true }).fill('Кофе и наш первый проект');
  await page.getByLabel('Место', { exact: true }).fill('Кофейня у главного входа');
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Познакомимся, обсудим идеи и соберём команду для проекта.');
  await page.getByRole('button', { name: 'Опубликовать событие', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Открыть: Кофе и наш первый проект' }),
  ).toBeVisible();
  await openTab(page, 'Мои планы');
  await page.getByRole('button', { name: 'Организую', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Открыть: Кофе и наш первый проект' }),
  ).toBeVisible();
  await openTab(page, 'Профиль');
  await page.getByRole('button', { name: 'Редактировать профиль' }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Алексей');
  await page.getByRole('button', { name: 'ИМИТ', exact: true }).click();
  await page.getByRole('textbox', { name:'Поиск', exact: true }).fill('естественных');
  await page.getByRole('button', { name: 'ИЕН', exact: true }).click();
  await page.getByRole('button', { name: 'Выбери группу', exact: true }).click();
  await page.getByRole('textbox', { name:'Поиск', exact: true }).fill('хим241');
  await expect(page.getByRole('button', { name: 'ПИ-231', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'ХИМ-241', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('heading', { name: 'Алексей', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти из профиля' }).click();
  await expect(page.getByRole('button', { name: 'Попробовать без заполнения' })).toBeVisible();
  await page.goto('/activity/volley');
  await expect(page.getByRole('button', { name: 'Попробовать без заполнения' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('small screens: main sections and forms stay within a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Попробовать без заполнения' }).click();
  for (const tab of ['События', 'Мои планы', 'Профиль']) {
    await openTab(page, tab);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({ path: 'preview/profile-320.png' });
  await page.getByRole('button', { name: 'Редактировать профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Твой профиль', exact: true })).toBeVisible();
  await page.screenshot({ path: 'preview/edit-profile-320.png' });
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await openTab(page, 'События');
  await page.screenshot({ path: 'preview/invites-320.png' });
  await page.getByRole('button', { name: 'Создать событие', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новое событие', exact: true })).toBeVisible();
  await page.screenshot({ path: 'preview/create-320.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
