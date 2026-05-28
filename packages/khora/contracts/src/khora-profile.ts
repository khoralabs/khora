import z from "zod";
import { zUsername } from "./username.ts";

export const zKhoraProfile = z.object({
  id: z.string().trim().min(1),
  username: zUsername,
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type KhoraProfile = z.infer<typeof zKhoraProfile>;

/** Allowed registration body fields; profile `id` is minted by the host. */
export const zKhoraRegistrationMetadata = z.object({
  username: zUsername,
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type KhoraRegistrationMetadataFields = z.infer<typeof zKhoraRegistrationMetadata>;

/** Parse `PrincipalRegistrationRequest.metadata`; ignores unknown keys (including legacy `profileId` / `id`). */
export function parseKhoraRegistrationMetadata(metadata: unknown): KhoraRegistrationMetadataFields {
  const parsed = zKhoraRegistrationMetadata.safeParse(metadata ?? {});
  if (!parsed.success) {
    throw new Error(`Khora: invalid registration metadata: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const zKhoraProfilePatch = z.object({
  username: zUsername.optional(),
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type KhoraProfilePatch = z.infer<typeof zKhoraProfilePatch>;

export function mergeKhoraProfilePatch(
  previous: KhoraProfile,
  patch: KhoraProfilePatch,
): KhoraProfile {
  return zKhoraProfile.parse({
    id: previous.id,
    username: patch.username ?? previous.username,
    displayName: patch.displayName ?? previous.displayName,
    bio: patch.bio ?? previous.bio,
  });
}

export function khoraProfileLexicalText(p: KhoraProfile): string {
  const parts = [p.username, p.displayName, p.bio].filter((s) => s !== undefined && s.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : p.id;
}
