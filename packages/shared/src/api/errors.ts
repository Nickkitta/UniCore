import { z } from 'zod';

/**
 * Every error code of the API and its HTTP status. The server answers with these codes only;
 * the client shows the text for the code from `errorMessages`.
 */
export const errorStatus = {
  UNICORE_AUTH_REQUIRED: 401,
  UNICORE_INVALID_CREDENTIALS: 401,
  UNICORE_ROOM_DENIED: 403,
  UNICORE_ORGANIZATION_FORBIDDEN: 403,
  UNICORE_FORBIDDEN: 403,
  UNICORE_EMAIL_NOT_CONFIRMED: 403,
  UNICORE_WRONG_PORTAL: 403,
  UNICORE_BAD_SIGNATURE: 403,
  UNICORE_NOT_FOUND: 404,
  UNICORE_FULL: 409,
  UNICORE_PAST: 409,
  UNICORE_HOST: 409,
  UNICORE_PARTNER_JOIN: 409,
  UNICORE_EMAIL_TAKEN: 409,
  UNICORE_FILE_TOO_LARGE: 413,
  UNICORE_INVALID_INPUT: 422,
  UNICORE_INVALID_GROUP: 422,
  UNICORE_INVALID_TAGS: 422,
  UNICORE_INVALID_PHOTOS: 422,
  UNICORE_INVALID_CODE: 422,
  UNICORE_WEAK_PASSWORD: 422,
  UNICORE_RATE_LIMIT: 429,
  UNICORE_INTERNAL: 500,
} as const;

export type ApiErrorCode = keyof typeof errorStatus;

/**
 * The body of every error response. The code is a plain string here, so a client parses
 * codes added after it was built; `message` is for debugging, never shown to the user.
 */
export const errorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

export function errorBody(code: ApiErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}
