import z from "zod";

export const zAtriumProfile = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type AtriumProfile = z.infer<typeof zAtriumProfile>;

/** Allowed registration body fields; profile `id` is minted by the host. */
export const zAtriumRegistrationMetadata = z.object({
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type AtriumRegistrationMetadataFields = z.infer<typeof zAtriumRegistrationMetadata>;

/** Parse `DidRegistrationRequest.metadata` display fields; ignores unknown keys (including legacy `profileId` / `id`). */
export function parseAtriumRegistrationMetadata(metadata: unknown): AtriumRegistrationMetadataFields {
  const parsed = zAtriumRegistrationMetadata.safeParse(metadata ?? {});
  if (!parsed.success) {
    throw new Error(`Atrium: invalid registration metadata: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const zAtriumProfilePatch = z.object({
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type AtriumProfilePatch = z.infer<typeof zAtriumProfilePatch>;

export function mergeAtriumProfilePatch(previous: AtriumProfile, patch: AtriumProfilePatch): AtriumProfile {
  return zAtriumProfile.parse({
    id: previous.id,
    displayName: patch.displayName ?? previous.displayName,
    bio: patch.bio ?? previous.bio,
  });
}

export function atriumProfileLexicalText(p: AtriumProfile): string {
  const parts = [p.displayName, p.bio].filter((s) => s !== undefined && s.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : p.id;
}
