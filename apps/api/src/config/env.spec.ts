import { envSchema } from './env.js';

const secret = 'x'.repeat(32);

describe('envSchema', () => {
  it('names a missing JWT_SECRET', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain('JWT_SECRET');
  });

  it('rejects a short JWT_SECRET', () => {
    expect(envSchema.safeParse({ JWT_SECRET: 'short' }).success).toBe(false);
  });

  it('applies defaults', () => {
    expect(envSchema.parse({ JWT_SECRET: secret })).toEqual({
      PORT: 3000,
      JWT_SECRET: secret,
      CORS_ORIGINS: ['http://localhost:8081'],
      TRUST_PROXY: false,
    });
  });

  it('parses the port and the list of origins', () => {
    const env = envSchema.parse({
      JWT_SECRET: secret,
      PORT: '4000',
      CORS_ORIGINS: ' http://localhost:8081 , https://unicore.example ,',
    });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:8081', 'https://unicore.example']);
  });

  it('passes the proxy address to Express and refuses a blanket true', () => {
    expect(envSchema.parse({ JWT_SECRET: secret, TRUST_PROXY: 'loopback' }).TRUST_PROXY).toBe(
      'loopback',
    );
    expect(envSchema.safeParse({ JWT_SECRET: secret, TRUST_PROXY: 'true' }).success).toBe(false);
  });
});
