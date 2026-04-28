import { z } from "zod";
import { zMatchmakingSimPersonaSlug } from "../../personas/slugs.ts";

export const zInviteePersonaSlug = zMatchmakingSimPersonaSlug;
export type InviteePersonaSlug = z.infer<typeof zInviteePersonaSlug>;

export const zRunId = z.uuid();
