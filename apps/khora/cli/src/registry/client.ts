import type { PersistableAgentSigner } from "@khoralabs/agent-persisted-signer";
import { signAgentRequest } from "@khoralabs/khora-auth";
import { loadRegistrySessionCookie } from "./session-store";

export async function registryFetch(
  registryUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = registryUrl.replace(/\/$/, "");
  const headers = new Headers(init.headers);
  const cookie = loadRegistrySessionCookie();
  if (cookie !== null && cookie.length > 0) {
    headers.set("Cookie", cookie);
  }
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

export async function deviceAuthorize(
  registryUrl: string,
  sourceApp = "khora-cli",
): Promise<{
  user_code: string;
  device_code: string;
  verification_url: string;
  expires_in: number;
}> {
  const res = await registryFetch(registryUrl, "/v1/device/authorize", {
    method: "POST",
    body: JSON.stringify({ sourceApp }),
  });
  if (!res.ok) {
    throw new Error(`device authorize failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as {
    user_code: string;
    device_code: string;
    verification_url: string;
    expires_in: number;
  };
}

export async function devicePollToken(
  registryUrl: string,
  deviceCode: string,
  expiresInSec: number,
): Promise<string> {
  const deadline = Date.now() + expiresInSec * 1000;
  while (Date.now() < deadline) {
    const res = await registryFetch(registryUrl, "/v1/device/token", {
      method: "POST",
      body: JSON.stringify({ device_code: deviceCode }),
    });
    if (res.status === 428) {
      await Bun.sleep(5000);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`device token failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as { status: string; session_cookie?: string };
    if (json.session_cookie === undefined || json.session_cookie.length === 0) {
      throw new Error("device token response missing session_cookie");
    }
    return json.session_cookie;
  }
  throw new Error("authorization expired; run khora link again");
}

export async function linkChallenge(
  registryUrl: string,
  did: string,
): Promise<{ challengeId: string; expiresAtMs: number }> {
  const res = await registryFetch(
    registryUrl,
    `/v1/link/challenge?did=${encodeURIComponent(did)}`,
    { method: "GET" },
  );
  if (!res.ok) {
    throw new Error(`link challenge failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { challengeId: string; expiresAtMs: number };
}

export type LinkAgentResult = {
  ok: boolean;
  link: {
    id: string;
    agentDid: string;
    hostSlug: string;
    hostBaseUrl: string;
    linkedAtMs: number;
  };
  propagated?: { hostSlug: string | null; ok: boolean; error?: string }[];
};

export async function linkAgent(
  registryUrl: string,
  signer: PersistableAgentSigner,
  params: {
    challengeId: string;
    hostBaseUrl: string;
    hostSlug?: string;
    propagateHostSlugs?: string[];
  },
): Promise<LinkAgentResult> {
  const body = JSON.stringify({
    challengeId: params.challengeId,
    hostBaseUrl: params.hostBaseUrl,
    ...(params.hostSlug !== undefined ? { hostSlug: params.hostSlug } : {}),
    ...(params.propagateHostSlugs !== undefined && params.propagateHostSlugs.length > 0
      ? { propagateHostSlugs: params.propagateHostSlugs }
      : {}),
  });
  const signed = await signAgentRequest({
    method: "POST",
    path: "/v1/link/agent",
    bodyText: body,
    signer,
  });
  const res = await registryFetch(registryUrl, "/v1/link/agent", {
    method: "POST",
    body,
    headers: signed.headers,
  });
  if (!res.ok) {
    throw new Error(`link agent failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as LinkAgentResult;
}

export async function linkEnsure(
  registryUrl: string,
  signer: PersistableAgentSigner,
  params: { hostBaseUrl: string; hostSlug?: string },
): Promise<LinkAgentResult["link"] | null> {
  const body = JSON.stringify({
    hostBaseUrl: params.hostBaseUrl,
    ...(params.hostSlug !== undefined ? { hostSlug: params.hostSlug } : {}),
  });
  const signed = await signAgentRequest({
    method: "POST",
    path: "/v1/link/agent/ensure",
    bodyText: body,
    signer,
  });
  const res = await registryFetch(registryUrl, "/v1/link/agent/ensure", {
    method: "POST",
    body,
    headers: signed.headers,
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`link ensure failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { link: LinkAgentResult["link"] };
  return json.link;
}

export async function linkStatus(registryUrl: string): Promise<unknown> {
  const res = await registryFetch(registryUrl, "/v1/link/status", { method: "GET" });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`link status failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<unknown>;
}

export type RegistryHostHealth = {
  status: "unknown" | "up" | "down";
  readyPath: string;
  healthPath: string;
  checkedAtMs: number | null;
  latencyMs: number | null;
  probedEndpoint: "ready" | "health" | null;
};

export type RegistryHostPublic = {
  id: string;
  slug: string;
  baseUrl: string;
  displayName?: string;
  description?: string;
  capabilities?: Record<string, unknown>;
  optedInAtMs: number | null;
  health?: RegistryHostHealth;
};

export async function fetchHosts(registryUrl: string): Promise<RegistryHostPublic[]> {
  const res = await registryFetch(registryUrl, "/v1/hosts", { method: "GET" });
  if (!res.ok) {
    throw new Error(`list hosts failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { hosts: RegistryHostPublic[] };
  return json.hosts ?? [];
}

export async function registerHost(
  registryUrl: string,
  body: {
    slug: string;
    baseUrl: string;
    displayName?: string;
    description?: string;
  },
): Promise<{ host: { id: string; slug: string; status: string }; message?: string }> {
  const res = await registryFetch(registryUrl, "/v1/hosts/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`host register failed: ${res.status} ${text}`);
  }
  return JSON.parse(text) as {
    host: { id: string; slug: string; status: string };
    message?: string;
  };
}

export async function linkUnlink(
  registryUrl: string,
  params: { hostBaseUrl: string; hostSlug?: string; agentDid: string },
): Promise<void> {
  const body = JSON.stringify({
    hostBaseUrl: params.hostBaseUrl,
    agentDid: params.agentDid,
    ...(params.hostSlug !== undefined ? { hostSlug: params.hostSlug } : {}),
  });
  const res = await registryFetch(registryUrl, "/v1/link/agent", {
    method: "DELETE",
    body,
  });
  if (!res.ok && res.status !== 401) {
    throw new Error(`link unlink failed: ${res.status} ${await res.text()}`);
  }
}
