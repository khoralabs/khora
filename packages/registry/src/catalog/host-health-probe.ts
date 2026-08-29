import type {
  HostHealthProbedEndpoint,
  HostHealthStatus,
  KhoraHost,
} from "@khoralabs/registry/contracts";
import type { RegistryDatabase } from "@khoralabs/registry/persistence";
import { assertSafeHostProbeTarget } from "./host-probe-target";
import { updateRegistrationRequirement } from "./host-registration-requirements";
import {
  findHostById,
  saveHostRegistrationRequirements,
  updateHostHealthCheck,
} from "./khora-hosts";

export type HostHealthProbeResult = {
  status: HostHealthStatus;
  latencyMs: number | null;
  probedEndpoint: HostHealthProbedEndpoint | null;
};

function joinBaseUrlAndPath(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchProbe(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  const res = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: res.ok, latencyMs: Date.now() - start };
}

/** Probe host readiness (/ready) then liveness (/health). */
export async function probeHostHealth(
  host: KhoraHost,
  options: { timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<HostHealthProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs;

  try {
    const readyUrl = joinBaseUrlAndPath(host.baseUrl, host.healthReadyPath);
    await assertSafeHostProbeTarget(readyUrl);
    const ready = await fetchProbe(readyUrl, timeoutMs, fetchImpl);
    if (ready.ok) {
      return { status: "up", latencyMs: ready.latencyMs, probedEndpoint: "ready" };
    }
  } catch {
    /* try health fallback */
  }

  try {
    const healthUrl = joinBaseUrlAndPath(host.baseUrl, host.healthPath);
    await assertSafeHostProbeTarget(healthUrl);
    const health = await fetchProbe(healthUrl, timeoutMs, fetchImpl);
    if (health.ok) {
      return { status: "up", latencyMs: health.latencyMs, probedEndpoint: "health" };
    }
  } catch {
    /* down */
  }

  return { status: "down", latencyMs: null, probedEndpoint: null };
}

function healthCheckRequirementDetail(result: HostHealthProbeResult): string {
  if (result.status === "up") {
    return `Health probe OK (${result.probedEndpoint ?? "unknown"})`;
  }
  return "Health probe failed";
}

/**
 * Single write path for probe results: health columns and health_check requirement stay in sync.
 */
export async function recordHostHealthProbe(
  db: RegistryDatabase,
  hostId: string,
  result: HostHealthProbeResult,
  options?: { checkedAtMs?: number; errorDetail?: string },
): Promise<KhoraHost> {
  const checkedAtMs = options?.checkedAtMs ?? Date.now();
  await updateHostHealthCheck(db, hostId, {
    status: result.status,
    checkedAtMs,
    latencyMs: result.latencyMs,
    probedEndpoint: result.probedEndpoint,
  });

  const host = await findHostById(db, hostId);
  if (host === null) {
    throw new Error("host not found");
  }
  if (!host.registrationRequirements.some((item) => item.id === "health_check")) {
    return host;
  }

  const detail = options?.errorDetail ?? healthCheckRequirementDetail(result);
  const requirements = updateRegistrationRequirement(
    host.registrationRequirements,
    "health_check",
    {
      status: result.status === "up" ? "satisfied" : "failed",
      detail,
    },
  );
  return saveHostRegistrationRequirements(db, hostId, requirements);
}

export async function applyHostHealthProbe(
  db: RegistryDatabase,
  host: KhoraHost,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch; checkedAtMs?: number },
): Promise<KhoraHost> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const result = await probeHostHealth(host, { timeoutMs, fetchImpl: options?.fetchImpl });
  return recordHostHealthProbe(db, host.id, result, { checkedAtMs: options?.checkedAtMs });
}
