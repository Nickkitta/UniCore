import { z } from 'zod';

const list = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const secondsPerUnit = { '': 1, s: 1, m: 60, h: 3600, d: 86_400 } as const;

/**
 * A lifetime such as `60s`, `15m`, `12h` or `30d`, in seconds; a bare number is seconds.
 * The bare number keeps the parse idempotent: ConfigModule writes the parsed values back to
 * process.env (`ACCESS_TTL=900`), and the tests' authHeader() parses process.env again.
 */
const duration = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((value, ctx) => {
      const match = /^([1-9]\d*)([smhd]?)$/.exec(value);
      if (!match) {
        ctx.addIssue({
          code: 'custom',
          message: 'must be a whole number of seconds, or one followed by s, m, h or d, e.g. 15m',
        });
        return z.NEVER;
      }
      return Number(match[1]) * secondsPerUnit[match[2] as keyof typeof secondsPerUnit];
    });

/**
 * Environment variables the server needs, checked once at startup.
 * Variables for later stages (database, mail, photos) are added by their tasks;
 * the full list lives in docs/backend-architecture.md, section 8.
 */
export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters long'),
  // Lifetimes of the access and refresh tokens, in seconds once parsed.
  ACCESS_TTL: duration('15m'),
  REFRESH_TTL: duration('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:8081').transform(list),
  // Passed to Express `trust proxy`: `false`, or the proxy address, e.g. `loopback`,
  // `uniquelocal` or a subnet. `true` would trust any client-supplied X-Forwarded-For.
  TRUST_PROXY: z
    .string()
    .default('false')
    .refine((value) => value !== 'true', 'name the proxy address instead of true')
    .transform((value) => (value === 'false' ? false : value)),
  // Postgres. Without it the server uses PGlite in PGLITE_DIR.
  // An empty value, as in .env.example, means "not set".
  DATABASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// or postgresql:// URL' })
      .optional(),
  ),
  // Relative to the working directory (apps/api for npm -w scripts); `memory://` keeps the data in memory.
  PGLITE_DIR: z.string().min(1).default('.local/pgdata'),
  // pino level; the e2e tests run with `silent`.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;
