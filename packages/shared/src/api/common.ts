import { z } from 'zod';
import { categories } from '../models.ts';

// Request schemas check the shape and the limits of single fields, and answer
// 422 UNICORE_INVALID_INPUT. Rules with a code of their own (UNICORE_WEAK_PASSWORD,
// UNICORE_INVALID_TAGS, UNICORE_PAST…) and rules that need the database stay in the services.

/** Ids of rows: the database makes them with gen_random_uuid(). */
export const idSchema = z.uuid();

/**
 * The form an email is stored and looked up in: `Test@Example.com ` is `test@example.com`.
 * The server applies it too, for callers that skip the schemas (CLI commands, the seeder).
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Normalized before the check, see `normalizeEmail`. */
export const emailSchema = z.string().overwrite(normalizeEmail).pipe(z.email().max(254));

/** An event category or an interest; 'Все' is only a filter in the app. */
export const categorySchema = z.enum(categories).exclude(['Все']);

/** A trimmed string of `min`–`max` characters, as the database CHECKs count them. */
export function textSchema(min: number, max: number) {
  return z.string().trim().min(min).max(max);
}
