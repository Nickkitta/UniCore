import { decodeJwt } from 'jose';
import { TokensService } from '../src/auth/tokens.service.js';
import { createTestApp, type TestApp } from './app.js';
import { authHeader, createUser } from './users.js';

describe('tokens in the assembled app', () => {
  let t: TestApp;
  let tokens: TokensService;

  beforeAll(async () => {
    t = await createTestApp();
    tokens = t.app.get(TokensService);
  });

  afterAll(async () => {
    await t.close();
  });

  it('accepts the token from authHeader(user) and reads the user id from it', async () => {
    const user = await createUser(t.db);
    const { Authorization } = await authHeader(user);
    expect(Authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);

    const token = Authorization.slice('Bearer '.length);
    expect(decodeJwt(token).sub).toBe(user.id);
    expect(await tokens.verifyAccessToken(token)).toBe(user.id);
  });

  it('takes the lifetimes from the config: 15 minutes by default', async () => {
    const user = await createUser(t.db);
    const issued = await tokens.issue(user.id);
    expect(issued.expiresIn).toBe(900);

    const claims = decodeJwt(issued.accessToken);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900);
    expect(await tokens.verifyAccessToken(issued.accessToken)).toBe(user.id);
  });
});
