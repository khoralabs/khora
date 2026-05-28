import {
  type KhoraProfile,
  type KhoraProfilePatch,
  normalizeUsername,
  zKhoraProfile,
  zKhoraProfilePatch,
} from "@khoralabs/khora-contracts";
import { KhoraClientError, type KhoraUnaryTransport } from "@khoralabs/khora-transport";

export function updateProfile(
  t: KhoraUnaryTransport,
  patch: KhoraProfilePatch,
): Promise<KhoraProfile> {
  const normalized = zKhoraProfilePatch.parse(patch);
  return t.requestJson("PATCH", "/v1/profile", {
    body: normalized,
    parse: zKhoraProfile,
  });
}

/** v2 host returns a bare {@link KhoraProfile}; `did` is included when resolved via by-did. */
export type PublicProfileResult = {
  profile: KhoraProfile;
  did?: string | undefined;
};

/** Resolve a username to its public profile. Returns `null` on 404. */
export async function lookupProfileByUsername(
  t: KhoraUnaryTransport,
  username: string,
): Promise<PublicProfileResult | null> {
  const normalized = normalizeUsername(username);
  try {
    const profile = await t.requestJson(
      "GET",
      `/v1/profile/by-username/${encodeURIComponent(normalized)}`,
      { parse: zKhoraProfile },
    );
    return { profile };
  } catch (e) {
    if (e instanceof KhoraClientError && e.status === 404) return null;
    throw e;
  }
}

/** Resolve a DID to its public profile. Returns `null` on 404. */
export async function lookupProfileByDid(
  t: KhoraUnaryTransport,
  did: string,
): Promise<PublicProfileResult | null> {
  try {
    const profile = await t.requestJson("GET", `/v1/profile/by-did/${encodeURIComponent(did)}`, {
      parse: zKhoraProfile,
    });
    return { profile, did };
  } catch (e) {
    if (e instanceof KhoraClientError && e.status === 404) return null;
    throw e;
  }
}
