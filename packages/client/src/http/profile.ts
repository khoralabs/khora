import {
  type KhoraProfile,
  type KhoraProfilePatch,
  normalizeUsername,
  zKhoraProfile,
  zKhoraProfilePatch,
} from "@khoralabs/khora-contracts";
import {
  KHORA_HTTP_PATH,
  khoraProfileByDidPath,
  khoraProfileByUsernamePath,
} from "@khoralabs/khora-contracts/http";
import z from "zod";
import { KhoraClientError, type KhoraUnaryTransport } from "../transport";

export function updateProfile(
  t: KhoraUnaryTransport,
  patch: KhoraProfilePatch,
): Promise<KhoraProfile> {
  const normalized = zKhoraProfilePatch.parse(patch);
  return t.requestJson("PATCH", KHORA_HTTP_PATH.profile, {
    body: normalized,
    parse: zKhoraProfile,
  });
}

/** Public profile lookup; `did` is set when the host returns it (by-username envelope or by-did). */
export type PublicProfileResult = {
  profile: KhoraProfile;
  did?: string | undefined;
};

const zPublicProfileEnvelope = z.object({
  did: z.string().min(1),
  profile: zKhoraProfile,
});

function parsePublicProfileBody(body: unknown, fallbackDid?: string): PublicProfileResult {
  const enveloped = zPublicProfileEnvelope.safeParse(body);
  if (enveloped.success) {
    return { profile: enveloped.data.profile, did: enveloped.data.did };
  }
  const profile = zKhoraProfile.parse(body);
  return {
    profile,
    ...(fallbackDid !== undefined ? { did: fallbackDid } : {}),
  };
}

/** Resolve a username to its public profile. Returns `null` on 404. */
export async function lookupProfileByUsername(
  t: KhoraUnaryTransport,
  username: string,
): Promise<PublicProfileResult | null> {
  const normalized = normalizeUsername(username);
  try {
    const body = await t.requestJson("GET", khoraProfileByUsernamePath(normalized), {
      parse: z.unknown(),
    });
    return parsePublicProfileBody(body);
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
    const body = await t.requestJson("GET", khoraProfileByDidPath(did), {
      parse: z.unknown(),
    });
    return parsePublicProfileBody(body, did);
  } catch (e) {
    if (e instanceof KhoraClientError && e.status === 404) return null;
    throw e;
  }
}
