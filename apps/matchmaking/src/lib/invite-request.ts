import { z } from "zod";
import { zInviteePersonaSlug } from "./domain/models/ids.ts";

export const inviteRequestSchema = z.object({
  personaSlug: zInviteePersonaSlug,
  message: z.string().trim().min(1).max(8000),
});
