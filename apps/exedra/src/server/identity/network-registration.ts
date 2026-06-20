import type { PersistableRelaySigner } from "@khoralabs/agent-persisted-signer";
import { signAgentRequest } from "@khoralabs/khora-auth";
import { KhoraClient, KhoraClientError } from "@khoralabs/khora-client";
import { normalizeUsername } from "@khoralabs/khora-contracts";

import { getIdentityKey, getKhoraHostSlug, getKhoraHostUrl } from "../env";
import { logger } from "../logger";
import { encodePrincipalIdForMemories } from "../memories/encode-principal-id";
import { getRegistryUrl } from "../registry-url";
import { loadSignerFromEncryptedBlob } from "./crypto";

export type HostRegistrationProfile = {
  username: string;
  displayName?: string;
  bio?: string;
};

function tryNormalizeUsername(raw: string): string | null {
  try {
    return normalizeUsername(raw);
  } catch {
    return null;
  }
}

export function usernameFromEmail(email: string | null, fallbackSeed: string): string {
  if (email !== null) {
    const localPart = email.split("@")[0]?.trim() ?? "";
    if (localPart.length > 0) {
      const normalized = tryNormalizeUsername(localPart);
      if (normalized !== null) return normalized;
    }
  }

  const sanitized = fallbackSeed
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fromSeed = tryNormalizeUsername(
    sanitized.length > 0 ? sanitized : `u${fallbackSeed.slice(0, 20)}`,
  );
  if (fromSeed !== null) return fromSeed;

  const digits = fallbackSeed.replace(/\D/g, "").slice(0, 20);
  return normalizeUsername(`u${digits.length > 0 ? digits : "exedra"}`);
}

export function usernameForOrg(orgId: string, orgName: string): string {
  const fromName = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const encoded = encodePrincipalIdForMemories(orgId);
  const candidates = [
    fromName.length > 0 ? `${fromName}-agent` : null,
    `org-${encoded.slice(0, 12)}`,
    `org-${encoded.slice(0, 8)}`,
  ].filter((value): value is string => value !== null);

  for (const candidate of candidates) {
    const normalized = tryNormalizeUsername(candidate);
    if (normalized !== null) return normalized;
  }

  return normalizeUsername(`org${encoded.slice(0, 20)}`);
}

async function registryFetch(
  registryUrl: string,
  path: string,
  init: RequestInit = {},
  sessionCookie?: string | null,
): Promise<Response> {
  const base = registryUrl.replace(/\/$/, "");
  const headers = new Headers(init.headers);
  if (sessionCookie !== undefined && sessionCookie !== null && sessionCookie.length > 0) {
    headers.set("Cookie", sessionCookie);
  }
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function registerDidOnHost(
  signer: PersistableRelaySigner,
  profile: HostRegistrationProfile,
): Promise<void> {
  const hostUrl = getKhoraHostUrl();
  if (hostUrl === null) return;

  const client = new KhoraClient({ baseUrl: hostUrl, signer });
  try {
    await client.register({
      metadata: {
        username: profile.username,
        ...(profile.displayName !== undefined ? { displayName: profile.displayName } : {}),
        ...(profile.bio !== undefined ? { bio: profile.bio } : {}),
      },
    });
  } catch (err: unknown) {
    if (err instanceof KhoraClientError && err.status === 409) {
      return;
    }
    throw err;
  }
}

async function linkChallenge(registryUrl: string, did: string): Promise<{ challengeId: string }> {
  const res = await registryFetch(
    registryUrl,
    `/v1/link/challenge?did=${encodeURIComponent(did)}`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error(`link challenge failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { challengeId: string };
}

export async function linkUserDidToRegistry(
  signer: PersistableRelaySigner,
  registrySessionCookie: string,
  params: { hostBaseUrl: string; hostSlug?: string },
): Promise<void> {
  const registryUrl = getRegistryUrl();
  const { challengeId } = await linkChallenge(registryUrl, signer.did);

  const body = JSON.stringify({
    challengeId,
    hostBaseUrl: params.hostBaseUrl,
    ...(params.hostSlug !== undefined ? { hostSlug: params.hostSlug } : {}),
  });
  const signed = await signAgentRequest({
    method: "POST",
    path: "/v1/link/agent",
    bodyText: body,
    signer,
  });
  const res = await registryFetch(
    registryUrl,
    "/v1/link/agent",
    { method: "POST", body, headers: signed.headers },
    registrySessionCookie,
  );
  if (res.status === 409) return;
  if (!res.ok) {
    throw new Error(`link agent failed: ${res.status} ${await res.text()}`);
  }
}

export async function registerUserDidOnNetwork(params: {
  identityEncrypted: Buffer;
  email: string | null;
  registrySessionCookie: string | null;
}): Promise<void> {
  const hostUrl = getKhoraHostUrl();
  if (hostUrl === null) return;

  const signer = await loadSignerFromEncryptedBlob(params.identityEncrypted, getIdentityKey());
  const displayName =
    params.email !== null ? (params.email.split("@")[0]?.trim() ?? undefined) : undefined;

  await registerDidOnHost(signer, {
    username: usernameFromEmail(params.email, signer.did),
    ...(displayName !== undefined && displayName.length > 0 ? { displayName } : {}),
  });

  if (params.registrySessionCookie === null || params.registrySessionCookie.length === 0) {
    return;
  }

  const hostSlug = getKhoraHostSlug();
  await linkUserDidToRegistry(signer, params.registrySessionCookie, {
    hostBaseUrl: hostUrl,
    ...(hostSlug !== null ? { hostSlug } : {}),
  });
}

export async function registerOrgDidOnNetwork(params: {
  identityEncrypted: Buffer;
  orgId: string;
  orgName: string;
}): Promise<void> {
  if (getKhoraHostUrl() === null) return;

  const signer = await loadSignerFromEncryptedBlob(params.identityEncrypted, getIdentityKey());
  await registerDidOnHost(signer, {
    username: usernameForOrg(params.orgId, params.orgName),
    displayName: params.orgName,
    bio: "Organization agent",
  });
}

export function scheduleUserNetworkRegistration(params: {
  identityEncrypted: Buffer;
  email: string | null;
  registrySessionCookie: string | null;
}): void {
  void registerUserDidOnNetwork(params).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "user network registration failed");
  });
}

export function scheduleOrgNetworkRegistration(params: {
  identityEncrypted: Buffer;
  orgId: string;
  orgName: string;
}): void {
  void registerOrgDidOnNetwork(params).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "org network registration failed");
  });
}
