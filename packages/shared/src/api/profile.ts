import { z } from 'zod';
import { courses, themeIds } from '../models.ts';
import { categorySchema, textSchema } from './common.ts';

/**
 * PATCH /v1/profile: the fields to change, own profile only. Unknown fields (id, email,
 * accountKind, isAdmin) are dropped. The institute–group pair and the partner's company
 * are checked by the server, which knows the account and the list of groups.
 */
export const profilePatchSchema = z
  .object({
    name: textSchema(1, 40),
    faculty: textSchema(0, 80),
    course: z.enum(courses),
    group: textSchema(0, 20),
    bio: textSchema(0, 300),
    interests: z.array(categorySchema),
    theme: z.enum(themeIds),
    company: textSchema(0, 80),
    companyAbout: textSchema(0, 400),
  })
  .partial();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
