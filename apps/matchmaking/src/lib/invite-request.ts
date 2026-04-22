import { z } from "zod";

export const inviteRequestSchema = z.object({
  personaSlug: z.enum(["p1", "p2", "p3"]),
  message: z.string().trim().min(1).max(8000),
});
