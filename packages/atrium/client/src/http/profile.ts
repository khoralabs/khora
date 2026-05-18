import {
  type AtriumProfile,
  type AtriumProfilePatch,
  normalizeUsername,
  zAtriumProfile,
  zAtriumProfilePatch,
} from "@khoralabs/at2-contracts";
import { At2ClientError, type At2UnaryTransport } from "@khoralabs/at2-transport";

export function updateProfile(
  t: At2UnaryTransport,
  patch: AtriumProfilePatch,
): Promise<AtriumProfile> {
  const normalized = zAtriumProfilePatch.parse(patch);
  return t.requestJson("PATCH", "/v1/profile", { body: normalized, parse: zAtriumProfile });
}

/** v2 host returns a bare {@link AtriumProfile}; `did` is included when resolved via by-did. */
export type PublicProfileResult = { profile: AtriumProfile; did?: string | undefined };

/** Resolve a username to its public profile. Returns `null` on 404. */
export async function lookupProfileByUsername(
  t: At2UnaryTransport,
  username: string,
): Promise<PublicProfileResult | null> {
  const normalized = normalizeUsername(username);
  try {
    const profile = await t.requestJson(
      "GET",
      `/v1/profile/by-username/${encodeURIComponent(normalized)}`,
      { parse: zAtriumProfile },
    );
    return { profile };
  } catch (e) {
    if (e instanceof At2ClientError && e.status === 404) return null;
    throw e;
  }
}

/** Resolve a DID to its public profile. Returns `null` on 404. */
export async function lookupProfileByDid(
  t: At2UnaryTransport,
  did: string,
): Promise<PublicProfileResult | null> {
  try {
    const profile = await t.requestJson("GET", `/v1/profile/by-did/${encodeURIComponent(did)}`, {
      parse: zAtriumProfile,
    });
    return { profile, did };
  } catch (e) {
    if (e instanceof At2ClientError && e.status === 404) return null;
    throw e;
  }
}
