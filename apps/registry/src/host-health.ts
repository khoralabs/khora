import {
  applyHostHealthProbe,
  findHostById,
  type HostHealthProbeResult,
  type KhoraHost,
  listHostsForHealthPoll,
  probeHostHealth,
} from "@khoralabs/registry-catalog";
import type { RegistryDatabase } from "@khoralabs/registry-persistence";

export type { HostHealthProbeResult };
export { probeHostHealth };

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

export async function runHostHealthPoll(
  db: RegistryDatabase,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? envProbeTimeoutMs();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const hosts = await listHostsForHealthPoll(db);
  const checkedAtMs = Date.now();

  for (const host of hosts) {
    await applyHostHealthProbe(db, host, { timeoutMs, fetchImpl, checkedAtMs });
  }
}

export async function probeHostHealthById(
  db: RegistryDatabase,
  hostId: string,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<KhoraHost | null> {
  const host = await findHostById(db, hostId);
  if (host === null || (host.status !== "active" && host.status !== "pending")) {
    return host;
  }
  const timeoutMs = options?.timeoutMs ?? envProbeTimeoutMs();
  return applyHostHealthProbe(db, host, { timeoutMs, fetchImpl: options?.fetchImpl });
}

export function startHostHealthPoller(db: RegistryDatabase): void {
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
