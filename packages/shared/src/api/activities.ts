import { z } from 'zod';
import { partnerBadges } from '../catalog.ts';
import { categorySchema, idSchema, textSchema } from './common.ts';

/**
 * POST /v1/activities, after the photos are uploaded with POST /v1/photos. The server checks
 * what needs the database or has its own code: a date in the past (UNICORE_PAST), tags
 * (UNICORE_INVALID_TAGS), photos (UNICORE_INVALID_PHOTOS), the community and the badge.
 */
export const createActivityRequestSchema = z.object({
  title: textSchema(5, 80),
  description: textSchema(15, 1500),
  location: textSchema(3, 120),
  category: categorySchema,
  /** ISO 8601 with `Z` or an offset, e.g. from `Date.toISOString()`. */
  startsAt: z.iso.datetime({ offset: true }),
  capacity: z.int().min(2).max(100),
  priceRub: z.int().min(0).max(1_000_000).default(0),
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable()
    .default(null),
  tags: z.array(z.string()).default([]),
  /** Partners only; required for them. */
  partnerBadge: z.enum(partnerBadges).optional(),
  /** Publish on behalf of a community the author owns. */
  organizationId: idSchema.nullable().optional(),
  photoIds: z.array(idSchema).default([]),
});
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;

export const createActivityResponseSchema = z.object({ id: z.string() });
export type CreateActivityResponse = z.infer<typeof createActivityResponseSchema>;

/** PUT /v1/activities/:id/membership */
export const setJoinedRequestSchema = z.object({ joined: z.boolean() });
export type SetJoinedRequest = z.infer<typeof setJoinedRequestSchema>;

/** PUT /v1/activities/:id/saved */
export const setSavedRequestSchema = z.object({ saved: z.boolean() });
export type SetSavedRequest = z.infer<typeof setSavedRequestSchema>;
