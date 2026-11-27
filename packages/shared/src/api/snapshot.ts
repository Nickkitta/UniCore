import { z } from 'zod';
import { accountKinds, activityKinds, themeIds } from '../models.ts';
import { categorySchema } from './common.ts';

// GET /v1/snapshot. The inferred types match Snapshot, Activity and Profile from models.ts
// (tests/api.test.ts checks it), so they aren't exported under the same names.

export const geoPointSchema = z.object({ latitude: z.number(), longitude: z.number() });

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

/** An activity in the feed. Unlike Activity in models.ts it has no Supabase `photoPaths`. */
export const activitySchema = z.object({
  partnerBadge: z.string().nullable().optional(),
  companyAbout: z.string().nullable().optional(),
  id: z.string(),
  kind: z.enum(activityKinds),
  title: z.string(),
  category: categorySchema,
  description: z.string(),
  startsAt: z.string(),
  location: z.string(),
  host: z.string(),
  hostId: z.string(),
  hostInfo: z.string(),
  attendees: z.number(),
  capacity: z.number(),
  tags: z.array(z.string()),
  featured: z.boolean().optional(),
  priceRub: z.number().optional(),
  coordinates: geoPointSchema.nullable().optional(),
  /** Signed links GET /v1/files/:id?exp=…&sig=…, in the order of the photos. */
  photoUrls: z.array(z.string()).optional(),
  organizationId: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
});

/** The signed-in user's own profile; nobody else's email or bio is ever sent. */
export const profileSchema = z.object({
  accountKind: z.enum(accountKinds).optional(),
  company: z.string().optional(),
  companyAbout: z.string().optional(),
  isAdmin: z.boolean().optional(),
  id: z.string(),
  name: z.string(),
  email: z.string(),
  faculty: z.string(),
  course: z.string(),
  group: z.string(),
  bio: z.string(),
  interests: z.array(categorySchema),
  theme: z.enum(themeIds).optional(),
});

export const snapshotSchema = z.object({
  groups: z.array(z.object({ faculty: z.string(), group: z.string() })).optional(),
  version: z.literal(1),
  session: z.boolean(),
  profile: profileSchema,
  activities: z.array(activitySchema),
  joinedIds: z.array(z.string()),
  savedIds: z.array(z.string()),
  organizations: z.array(organizationSchema).optional(),
});
