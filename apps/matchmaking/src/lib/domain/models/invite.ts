import { z } from "zod";
import { zInviteePersonaSlug, zRunId } from "./ids.ts";

export const zInviteStatus = z.enum(["pending", "negotiating", "finished", "failed"] as const);
export type InviteStatus = z.infer<typeof zInviteStatus>;

/**
 * One negotiation run from POST /api/invites. `id` = `runId` (UUID).
 */
export const zInvite = z.object({
  id: zRunId,
  subjectId: z.string().min(1),
  inviteePersonaSlug: zInviteePersonaSlug,
  message: z.string(),
  status: zInviteStatus,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Invite = z.infer<typeof zInvite>;

export type InviteCreate = Omit<Invite, "status" | "createdAt" | "updatedAt"> & {
  status?: InviteStatus;
};
