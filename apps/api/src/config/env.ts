import { z } from 'zod';

const list = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Environment variables the server needs, checked once at startup.
 * Variables for later stages (database, mail, photos) are added by their tasks;
 * the full list lives in docs/backend-architecture.md, section 8.
 */
export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters long'),
  CORS_ORIGINS: z.string().default('http://localhost:8081').transform(list),
  // Passed to Express `trust proxy`: `false`, or the proxy address, e.g. `loopback`,
  // `uniquelocal` or a subnet. `true` would trust any client-supplied X-Forwarded-For.
  TRUST_PROXY: z
    .string()
    .default('false')
    .refine((value) => value !== 'true', 'name the proxy address instead of true')
    .transform((value) => (value === 'false' ? false : value)),
});

export type Env = z.infer<typeof envSchema>;
