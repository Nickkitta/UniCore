import { HttpStatus } from '@nestjs/common';
import type { VerifyOutcome } from './email-verification.service.js';

interface Page {
  status: number;
  title: string;
  text: string;
}

const pages: Record<VerifyOutcome, Page> = {
  verified: {
    status: HttpStatus.OK,
    title: 'Почта подтверждена',
    text: 'Вернись в приложение UniCore и войди в аккаунт.',
  },
  already: {
    status: HttpStatus.OK,
    title: 'Почта уже подтверждена',
    text: 'Ссылка больше не нужна — просто войди в приложение UniCore.',
  },
  expired: {
    status: HttpStatus.GONE,
    title: 'Ссылка устарела',
    text: 'Ссылка из письма действует 24 часа. Открой UniCore и нажми «Отправить письмо ещё раз».',
  },
  invalid: {
    status: HttpStatus.NOT_FOUND,
    title: 'Ссылка недействительна',
    text: 'Проверь, что ссылка скопирована из письма целиком, или запроси новое письмо в приложении UniCore.',
  },
};

/**
 * The page a browser shows for the link from the email. The texts are fixed and the page
 * holds no user data and loads nothing from outside.
 */
export function verifyPage(outcome: VerifyOutcome): { status: number; html: string } {
  const { status, title, text } = pages[outcome];
  const mark = status === HttpStatus.OK ? '✓' : '!';
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — UniCore</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f4ff; --card: #ffffff; --text: #1d1838; --muted: #5f5a7a; --accent: #6c4cf1; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14111f; --card: #1f1a33; --text: #f2f0ff; --muted: #b3adcf; --accent: #9b85ff; }
  }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 420px; width: 100%; background: var(--card); border-radius: 20px; padding: 32px 24px; text-align: center;
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.08); }
  .mark { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; display: grid; place-items: center;
    background: var(--accent); color: #fff; font-size: 28px; font-weight: 700; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { margin: 0; color: var(--muted); }
  .brand { margin-top: 24px; font-weight: 600; color: var(--accent); }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true">${mark}</div>
  <h1>${title}</h1>
  <p>${text}</p>
  <p class="brand">UniCore</p>
</main>
</body>
</html>
`;
  return { status, html };
}
