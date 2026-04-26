import { z } from "zod";

export const zUserPublicProfileFields = z.object({
  displayName: z.string().trim().min(1).max(200),
  tagline: z.string().max(500),
  about: z.string().max(8000),
});
export type UserPublicProfileFields = z.infer<typeof zUserPublicProfileFields>;

export const zProfile = zUserPublicProfileFields.extend({
  subjectId: z.string().min(1),
  updatedAt: z.number().int(),
});
export type Profile = z.infer<typeof zProfile>;
