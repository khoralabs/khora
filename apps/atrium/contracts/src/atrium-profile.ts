import type { DidRegistrationRequest } from "@cfd/swarm-host";
import z from "zod";

export const zAtriumProfile = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

export type AtriumProfile = z.infer<typeof zAtriumProfile>;

const zRegistrationMetadata = z.object({
  profileId: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1).optional(),
  displayName: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(8000).optional(),
});

/** Build {@link AtriumProfile} from {@link DidRegistrationRequest.metadata}; requires `profileId` or `id`. */
export function atriumProfileFromRegistrationRequest(req: DidRegistrationRequest): AtriumProfile {
  const meta = zRegistrationMetadata.safeParse(req.metadata ?? {});
  if (!meta.success) {
    throw new Error(`Atrium: invalid registration metadata: ${meta.error.message}`);
  }
  const rawId = meta.data.profileId ?? meta.data.id;
  if (rawId === undefined || rawId.length === 0) {
    throw new Error("Atrium: registration metadata must include `profileId` or `id`");
  }
  return zAtriumProfile.parse({
    id: rawId,
    displayName: meta.data.displayName,
    bio: meta.data.bio,
  });
}

export function atriumProfileLexicalText(p: AtriumProfile): string {
  const parts = [p.displayName, p.bio].filter((s) => s !== undefined && s.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : p.id;
}
