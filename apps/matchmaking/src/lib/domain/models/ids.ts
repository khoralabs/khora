import { z } from "zod";

export const zInviteePersonaSlug = z.enum(["p1", "p2", "p3"]);
export type InviteePersonaSlug = z.infer<typeof zInviteePersonaSlug>;

export const zRunId = z.string().uuid();
