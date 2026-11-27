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
      PGLITE_DIR: '.local/pgdata',
      LOG_LEVEL: 'info',
    });
  });

  it('accepts only pino log levels', () => {
    expect(envSchema.parse({ JWT_SECRET: secret, LOG_LEVEL: 'silent' }).LOG_LEVEL).toBe('silent');
    expect(envSchema.safeParse({ JWT_SECRET: secret, LOG_LEVEL: 'verbose' }).success).toBe(false);
  });

  it('accepts only a Postgres DATABASE_URL', () => {
    const url = 'postgres://unicore:secret@localhost:5432/unicore';
    expect(envSchema.parse({ JWT_SECRET: secret, DATABASE_URL: url }).DATABASE_URL).toBe(url);
    expect(
      envSchema.safeParse({ JWT_SECRET: secret, DATABASE_URL: 'postgresql://localhost/unicore' })
        .success,
    ).toBe(true);
    expect(
      envSchema.safeParse({ JWT_SECRET: secret, DATABASE_URL: 'mysql://localhost/unicore' })
        .success,
    ).toBe(false);
    expect(envSchema.parse({ JWT_SECRET: secret, DATABASE_URL: '' }).DATABASE_URL).toBeUndefined();
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
