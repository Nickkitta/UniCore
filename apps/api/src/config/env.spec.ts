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
      ACCESS_TTL: 900,
      REFRESH_TTL: 2_592_000,
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

  it('turns token lifetimes into seconds', () => {
    const env = envSchema.parse({ JWT_SECRET: secret, ACCESS_TTL: '60s', REFRESH_TTL: '12h' });
    expect(env.ACCESS_TTL).toBe(60);
    expect(env.REFRESH_TTL).toBe(43_200);
    expect(envSchema.parse({ JWT_SECRET: secret, ACCESS_TTL: '900' }).ACCESS_TTL).toBe(900);
  });

  it('parses again what ConfigModule writes back to process.env', () => {
    // ConfigModule copies parsed strings, numbers and booleans into process.env; a second
    // parse (the tests' authHeader, another app in the same process) must give the same values.
    const first = envSchema.parse({ JWT_SECRET: secret });
    const written = Object.fromEntries(
      Object.entries(first)
        .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
        .map(([key, value]) => [key, String(value)]),
    );
    expect(envSchema.parse(written)).toEqual(first);
  });

  it.each(['0', '0m', 'abc', '1w', '15 m', '-5m', '1.5h', ''])(
    'names ACCESS_TTL when it is %j',
    (value) => {
      const result = envSchema.safeParse({ JWT_SECRET: secret, ACCESS_TTL: value });
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['ACCESS_TTL']);
    },
  );
});
