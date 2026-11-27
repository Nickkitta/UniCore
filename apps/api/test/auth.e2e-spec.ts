import { eq } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { TokensService } from '../src/auth/tokens.service.js';
import { profiles, refreshTokens, users } from '../src/db/schema.js';
import { createTestApp, type TestApp } from './app.js';
import { createUser, testPassword } from './users.js';

describe('/v1/auth', () => {
  let t: TestApp;
  let tokens: TokensService;

  beforeAll(async () => {
    t = await createTestApp();
    tokens = t.app.get(TokensService);
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, body?: object) => {
    const req = t.http().post(`/v1/auth/${path}`);
    return body ? req.send(body) : req;
  };

  const sessionsOf = (userId: string) =>
    t.db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId));

  const tokensShape = {
    accessToken: expect.any(String) as string,
    refreshToken: expect.any(String) as string,
    expiresIn: 900,
  };

  describe('sign-up', () => {
    it('creates a student and answers 201 with a session for them', async () => {
      const response = await post('sign-up', {
        email: ' New@Example.TEST ',
        password: 'correct horse',
        name: ' Аня ',
      }).expect(201);
      expect(response.body).toEqual(tokensShape);

      const userId = decodeJwt(response.body.accessToken as string).sub as string;
      const [user] = await t.db.select().from(users).where(eq(users.id, userId));
      expect(user.email).toBe('new@example.test');
      const [profile] = await t.db.select().from(profiles).where(eq(profiles.id, userId));
      expect(profile).toMatchObject({ accountKind: 'student', name: 'Аня' });
    });

    it('rejects a short password: 422 UNICORE_WEAK_PASSWORD', async () => {
      const response = await post('sign-up', {
        email: 'short@example.test',
        password: '1234567',
        name: 'Аня',
      }).expect(422);
      expect(response.body.error.code).toBe('UNICORE_WEAK_PASSWORD');
    });

    it('rejects a taken email: 409 UNICORE_EMAIL_TAKEN', async () => {
      const user = await createUser(t.db);
      const response = await post('sign-up', {
        email: user.email.toUpperCase(),
        password: 'correct horse',
        name: 'Боря',
      }).expect(409);
      expect(response.body.error.code).toBe('UNICORE_EMAIL_TAKEN');
    });

    it('does not register a partner yet (task 3.5): 422 UNICORE_INVALID_CODE, no account', async () => {
      const response = await post('sign-up', {
        email: 'company@example.test',
        password: 'correct horse',
        name: 'Боря',
        partner: { company: 'Компания', code: 'some-code' },
      }).expect(422);
      expect(response.body.error.code).toBe('UNICORE_INVALID_CODE');
      expect(
        await t.db.select().from(users).where(eq(users.email, 'company@example.test')),
      ).toEqual([]);
    });

    it('rejects a request without a body: 422 UNICORE_INVALID_INPUT', async () => {
      const response = await post('sign-up').expect(422);
      expect(response.body.error.code).toBe('UNICORE_INVALID_INPUT');
    });
  });

  describe('sign-in', () => {
    it('answers 200 with a session of the user', async () => {
      const user = await createUser(t.db);
      const response = await post('sign-in', {
        email: user.email,
        password: testPassword,
        portal: 'student',
      }).expect(200);
      expect(response.body).toEqual(tokensShape);
      expect(await tokens.verifyAccessToken(response.body.accessToken as string)).toBe(user.id);
    });

    it('answers a wrong password and an unknown email with the same 401', async () => {
      const user = await createUser(t.db);
      const wrongPassword = await post('sign-in', {
        email: user.email,
        password: 'wrong-password',
        portal: 'student',
      }).expect(401);
      const unknownEmail = await post('sign-in', {
        email: 'nobody@example.test',
        password: testPassword,
        portal: 'student',
      }).expect(401);
      expect(wrongPassword.body.error.code).toBe('UNICORE_INVALID_CREDENTIALS');
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('turns a student away from the partner portal: 403 UNICORE_WRONG_PORTAL, no tokens', async () => {
      const student = await createUser(t.db);
      const response = await post('sign-in', {
        email: student.email,
        password: testPassword,
        portal: 'partner',
      }).expect(403);
      expect(response.body).toEqual({
        error: { code: 'UNICORE_WRONG_PORTAL', message: expect.any(String) as string },
      });
      expect(await sessionsOf(student.id)).toEqual([]);
    });

    it('lets a partner in only through the partner portal', async () => {
      const partner = await createUser(t.db, { kind: 'partner' });
      const credentials = { email: partner.email, password: testPassword };
      await post('sign-in', { ...credentials, portal: 'partner' }).expect(200);
      const response = await post('sign-in', { ...credentials, portal: 'student' }).expect(403);
      expect(response.body.error.code).toBe('UNICORE_WRONG_PORTAL');
    });
  });

  describe('refresh and sign-out', () => {
    async function signIn() {
      const user = await createUser(t.db);
      const response = await post('sign-in', {
        email: user.email,
        password: testPassword,
        portal: 'student',
      }).expect(200);
      return response.body as { accessToken: string; refreshToken: string };
    }

    it('exchanges a refresh token for a new pair; the old one then revokes the session', async () => {
      const first = await signIn();
      const response = await post('refresh', { refreshToken: first.refreshToken }).expect(200);
      expect(response.body).toEqual(tokensShape);
      const second = response.body as typeof first;
      expect(second.refreshToken).not.toBe(first.refreshToken);

      const reused = await post('refresh', { refreshToken: first.refreshToken }).expect(401);
      expect(reused.body.error.code).toBe('UNICORE_AUTH_REQUIRED');
      await post('refresh', { refreshToken: second.refreshToken }).expect(401);
    });

    it('signs out with 204, after which the refresh token no longer works', async () => {
      const session = await signIn();
      const response = await post('sign-out', { refreshToken: session.refreshToken }).expect(204);
      expect(response.text).toBe('');

      const refresh = await post('refresh', { refreshToken: session.refreshToken }).expect(401);
      expect(refresh.body.error.code).toBe('UNICORE_AUTH_REQUIRED');
    });

    it('answers 204 to a repeated sign-out and to an unknown token', async () => {
      const session = await signIn();
      await post('sign-out', { refreshToken: session.refreshToken }).expect(204);
      await post('sign-out', { refreshToken: session.refreshToken }).expect(204);
      await post('sign-out', { refreshToken: 'not-a-token' }).expect(204);
    });

    it('rejects an empty refresh token: 422 UNICORE_INVALID_INPUT', async () => {
      const response = await post('refresh', { refreshToken: '' }).expect(422);
      expect(response.body.error.code).toBe('UNICORE_INVALID_INPUT');
    });
  });
});
