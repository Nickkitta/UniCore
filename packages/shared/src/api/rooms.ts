import { z } from 'zod';
import { textSchema } from './common.ts';

/** GET /v1/activities/:id/room — the host and the participants only. */
export const eventRoomSchema = z.object({
  isCohost: z.boolean().optional(),
  /** Visible to the host and co-hosts only; co-hosts first. */
  members: z.array(
    z.object({ id: z.string(), name: z.string(), isCohost: z.boolean().optional() }),
  ),
  /** The last 100 messages, oldest first. */
  messages: z.array(
    z.object({ id: z.string(), name: z.string(), body: z.string(), sentAt: z.string() }),
  ),
});

/** POST /v1/activities/:id/messages */
export const postMessageRequestSchema = z.object({ body: textSchema(1, 1000) });
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

/** PUT /v1/activities/:id/members/:userId/cohost */
export const setCohostRequestSchema = z.object({ enabled: z.boolean() });
export type SetCohostRequest = z.infer<typeof setCohostRequestSchema>;
