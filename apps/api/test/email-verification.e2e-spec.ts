import { eq } from 'drizzle-orm';
import { EmailVerificationService } from '../src/auth/email-verification.service.js';
import { emailTokens, users } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './app.js';
import { createUser, testPassword } from './users.js';

// Runs before the imports above, so ConfigModule reads the flag when AppModule is imported.
// Vitest gives every test file its own modules, so the other files keep the default `false`.
vi.hoisted(() => {
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
});

describe('email verification with AUTH_REQUIRE_EMAIL_VERIFICATION=true', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, body: object) => t.http().post(`/v1/auth/${path}`).send(body);
  const signIn = (email: string, password: string) =>
    post('sign-in', { email, password, portal: 'student' });

  /** The path and query of the link in the latest mail to `email`, for supertest. */
  async function linkFor(email: string) {
    // The mail goes out in the background, after the response.
    const mail = await vi.waitFor(() => t.mailbox.assertSent({ to: email }));
    const url = mail.link('/v1/auth/verify');
    return `${url.pathname}${url.search}`;
  }

  async function signUp(email: string) {
    const response = await post('sign-up', { email, password: 'correct horse', name: 'Аня' });
    expect(response.status).toBe(201);
    return response;
  }

  it('lets a new account in only after the link from the email is opened', async () => {
    const email = 'flow@example.test';
    expect((await signUp(email)).body).toEqual({ verificationRequired: true });

    const mail = await vi.waitFor(() => t.mailbox.assertSent({ to: email }));
    expect(mail.subject).toBe('Подтверди почту в UniCore');
    expect(mail.link('/v1/auth/verify').origin).toBe('http://localhost:3000');

    const refused = await signIn(email, 'correct horse').expect(403);
    expect(refused.body.error.code).toBe('UNICORE_EMAIL_NOT_CONFIRMED');

    const page = await t
      .http()
      .get(await linkFor(email))
      .expect(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.text).toContain('Почта подтверждена');

    await signIn(email, 'correct horse').expect(200);
  });

  it('works once: a second click says the email is confirmed and changes nothing', async () => {
    const email = 'twice@example.test';
    await signUp(email);
    const link = await linkFor(email);
    await t.http().get(link).expect(200);
    const [before] = await t.db.select().from(users).where(eq(users.email, email));

    const again = await t.http().get(link).expect(200);
    expect(again.text).toContain('Почта уже подтверждена');
    const [after] = await t.db.select().from(users).where(eq(users.email, email));
    expect(after.emailVerifiedAt).toEqual(before.emailVerifiedAt);
  });

  it('shows an error page for an expired link (410) and an unknown one (404)', async () => {
    const user = await createUser(t.db, { verified: false });
    const token = await t.app
      .get(EmailVerificationService)
      .issue(t.db, user.id, new Date(Date.now() - 25 * 60 * 60 * 1000));

    const expired = await t.http().get(`/v1/auth/verify?token=${token}`).expect(410);
    expect(expired.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(expired.text).toContain('Ссылка устарела');
    await signIn(user.email, testPassword).expect(403);

    const unknown = await t.http().get('/v1/auth/verify?token=made-up').expect(404);
    expect(unknown.text).toContain('Ссылка недействительна');
  });

  it('answers a link without a token in the contract format, as JSON', async () => {
    const response = await t.http().get('/v1/auth/verify').expect(422);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body.error.code).toBe('UNICORE_INVALID_INPUT');
  });

  it('resends with the same 204 whether the account exists or not, at most once a minute', async () => {
    const user = await createUser(t.db, { verified: false });
    const tokensOfUser = () =>
      t.db.select().from(emailTokens).where(eq(emailTokens.userId, user.id));

    await post('resend-verification', { email: 'nobody@example.test' }).expect(204);
    await post('resend-verification', { email: user.email }).expect(204);
    await post('resend-verification', { email: user.email }).expect(204);
    // A link is stored exactly when a mail goes out: one within the minute.
    expect(await tokensOfUser()).toHaveLength(1);

    await t
      .http()
      .get(await linkFor(user.email))
      .expect(200);
    await signIn(user.email, testPassword).expect(200);
    expect(t.mailbox.filter({ to: user.email })).toHaveLength(1);
    t.mailbox.assertNotSent({ to: 'nobody@example.test' });
  });
});
