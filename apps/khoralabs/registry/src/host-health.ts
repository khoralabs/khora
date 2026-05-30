import type { Database } from "bun:sqlite";
import {
  findHostById,
  type HostHealthProbedEndpoint,
  type HostHealthStatus,
  type KhoraHost,
  listActiveHosts,
  updateHostHealthCheck,
} from "@khoralabs/users";

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
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: res.ok, latencyMs: Date.now() - start };
}

export async function probeHostHealth(
  host: KhoraHost,
  options: { timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<HostHealthProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs;

  try {
    const readyUrl = joinBaseUrlAndPath(host.baseUrl, host.healthReadyPath);
    const ready = await fetchProbe(readyUrl, timeoutMs, fetchImpl);
    if (ready.ok) {
      return { status: "up", latencyMs: ready.latencyMs, probedEndpoint: "ready" };
    }
  } catch {
    /* try health fallback */
  }

  try {
    const healthUrl = joinBaseUrlAndPath(host.baseUrl, host.healthPath);
    const health = await fetchProbe(healthUrl, timeoutMs, fetchImpl);
    if (health.ok) {
      return { status: "up", latencyMs: health.latencyMs, probedEndpoint: "health" };
    }
  } catch {
    /* down */
  }

  return { status: "down", latencyMs: null, probedEndpoint: null };
}

export async function runHostHealthPoll(
  db: Database,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? envProbeTimeoutMs();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const hosts = listActiveHosts(db);
  const checkedAtMs = Date.now();

  for (const host of hosts) {
    const result = await probeHostHealth(host, { timeoutMs, fetchImpl });
    updateHostHealthCheck(db, host.id, {
      status: result.status,
      checkedAtMs,
      latencyMs: result.latencyMs,
      probedEndpoint: result.probedEndpoint,
    });
  }
}

export async function probeHostHealthById(
  db: Database,
  hostId: string,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<KhoraHost | null> {
  const host = findHostById(db, hostId);
  if (host === null || host.status !== "active") {
    return host;
  }
  const timeoutMs = options?.timeoutMs ?? envProbeTimeoutMs();
  const result = await probeHostHealth(host, {
    timeoutMs,
    fetchImpl: options?.fetchImpl,
  });
  return updateHostHealthCheck(db, hostId, {
    status: result.status,
    checkedAtMs: Date.now(),
    latencyMs: result.latencyMs,
    probedEndpoint: result.probedEndpoint,
  });
}

function envPollIntervalMs(): number {
  const raw = process.env.REGISTRY_HOST_HEALTH_POLL_INTERVAL_MS?.trim();
  const n = raw !== undefined ? Number.parseInt(raw, 10) : 60_000;
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

function envProbeTimeoutMs(): number {
  const raw = process.env.REGISTRY_HOST_HEALTH_PROBE_TIMEOUT_MS?.trim();
  const n = raw !== undefined ? Number.parseInt(raw, 10) : 5000;
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

export function startHostHealthPoller(db: Database): void {
  if (process.env.REGISTRY_HOST_HEALTH_POLL_DISABLED?.trim() === "1") {
    console.log("[registry] Host health polling disabled");
    return;
  }

  const intervalMs = envPollIntervalMs();
  const timeoutMs = envProbeTimeoutMs();

  void runHostHealthPoll(db, { timeoutMs }).catch((err) => {
    console.error("[registry] Host health poll failed:", err);
  });

  setInterval(() => {
    void runHostHealthPoll(db, { timeoutMs }).catch((err) => {
      console.error("[registry] Host health poll failed:", err);
    });
  }, intervalMs);

  console.log(
    `[registry] Host health polling every ${intervalMs}ms (probe timeout ${timeoutMs}ms)`,
  );
}
