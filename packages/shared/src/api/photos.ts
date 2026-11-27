import { z } from 'zod';

/** POST /v1/photos: one JPEG as multipart; the id goes to `photoIds` of the new activity. */
export const uploadPhotoResponseSchema = z.object({ id: z.string() });
export type UploadPhotoResponse = z.infer<typeof uploadPhotoResponseSchema>;

/**
 * GET /v1/files/:id?exp=…&sig=… — a signed link from the snapshot. A wrong or expired
 * signature is UNICORE_BAD_SIGNATURE (403) from the server, not a schema error.
 */
export const fileQuerySchema = z.object({
  /** Unix time in seconds. */
  exp: z.coerce.number().int(),
  sig: z.string().min(1),
});
export type FileQuery = z.infer<typeof fileQuerySchema>;
