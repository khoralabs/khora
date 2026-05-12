import {
  type AtriumProfile,
  type AtriumProfilePatch,
  normalizeUsername,
  zAtriumProfile,
  zAtriumProfilePatch,
} from "@khoralabs/atrium-contracts";
import z from "zod";
import { AtriumClientError } from "../atrium-client-error.ts";
import type { HttpTransport } from "./transport.ts";

export function updateProfile(t: HttpTransport, patch: AtriumProfilePatch): Promise<AtriumProfile> {
  // Parse first so client-side validation (incl. username normalization) runs before the network
  // call. The host re-validates with the same schema.
  const normalized = zAtriumProfilePatch.parse(patch);
  return t.requestJson("PATCH", "/v1/profile", { body: normalized, parse: zAtriumProfile });
}

const zProfileByUsernameResponse = z.object({
  did: z.string(),
  profile: zAtriumProfile,
});

export type ProfileByUsernameResponse = z.infer<typeof zProfileByUsernameResponse>;

/** Resolve a username to its DID + public profile. Returns `null` on 404. */
export async function lookupProfileByUsername(
  t: HttpTransport,
  username: string,
): Promise<ProfileByUsernameResponse | null> {
  const normalized = normalizeUsername(username);
  try {
    return await t.requestJson("GET", `/v1/profile/by-username/${encodeURIComponent(normalized)}`, {
      parse: zProfileByUsernameResponse,
    });
  } catch (e) {
    if (e instanceof AtriumClientError && e.status === 404) return null;
    throw e;
  }
}
