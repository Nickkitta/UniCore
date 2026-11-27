import { z } from 'zod';

/** POST /v1/admin/partner-codes: a one-time code for a partner's sign-up. */
export const partnerCodeResponseSchema = z.object({ code: z.string() });
export type PartnerCodeResponse = z.infer<typeof partnerCodeResponseSchema>;
