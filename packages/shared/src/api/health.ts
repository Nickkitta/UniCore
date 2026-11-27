import { z } from 'zod';

/** GET /v1/health: 200 `{ ok: true }`, or 503 `{ ok: false }` when the database is down. */
export const healthResponseSchema = z.object({ ok: z.boolean() });
export type HealthResponse = z.infer<typeof healthResponseSchema>;
