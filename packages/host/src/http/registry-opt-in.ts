import {
  fetchHostRegistrationStatus,
  registerHostWithRegistryRemote,
  syncHostRegistryOnStartup,
} from "@khoralabs/khora-registry/client";
import type { KhoraHostSpecPort } from "..";
import { logger } from "./logger";
import { toRegistryClientConfig } from "./registry-client-config";

const DEFAULT_REGISTRY_URL = "http://localhost:4000";

function envHostSlug(): string | undefined {
  const slug = process.env.KHORA_HOST_SLUG?.trim();
  return slug !== undefined && slug.length > 0 ? slug : undefined;
}

function envPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw.length === 0) return 8788;
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 8788;
}

function envPublicBaseUrl(port: number): string {
  const fromEnv = process.env.KHORA_PUBLIC_BASE_URL?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return `http://127.0.0.1:${port}`;
}

function envRegistryUrl(): string | undefined {
  const url = process.env.KHORA_REGISTRY_URL?.trim();
  return url !== undefined && url.length > 0 ? url.replace(/\/$/, "") : undefined;
}

function envRegistryParticipate(): boolean {
  const v = process.env.KHORA_REGISTRY_PARTICIPATE?.trim().toLowerCase();
  return v === "1" || v === "true";
}

function envHostDisplayName(): string | undefined {
  const name = process.env.KHORA_HOST_DISPLAY_NAME?.trim();
  return name !== undefined && name.length > 0 ? name : undefined;
}

export type RegistryOptInParams = {
  registryUrl: string;
  slug: string;
  baseUrl: string;
  displayName?: string;
  fetchImpl?: typeof fetch;
};

export async function registerHostWithRegistry(params: RegistryOptInParams): Promise<void> {
  const { registryUrl, slug, baseUrl, displayName, fetchImpl = fetch } = params;
  try {
    await registerHostWithRegistryRemote(
      {
        registryUrl,
        slug,
        publicBaseUrl: baseUrl,
        ...(displayName !== undefined ? { displayName } : {}),
      },
      fetchImpl,
    );
    logger.info({ slug, registryUrl }, "registry opt-in: host registered");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already registered") || msg.includes("(409)")) {
      logger.info({ slug, registryUrl }, "registry opt-in: host already registered");
      return;
    }
    logger.warn(
      { err, slug, registryUrl, body: msg.slice(0, 500) },
      "registry opt-in: registration failed",
    );
  }
}

/**
 * Env-gated registry registration + pending-token poll + trusted-origin sync.
 * No-op when participation is off and no stored slug; safe to call from every host bootstrap.
 */
export function maybeRegistryOptInOnStartup(hostSpec: KhoraHostSpecPort): void {
  const effective = hostSpec.readEffective();
  const envParticipate = envRegistryParticipate();
  const slug = effective.slug ?? envHostSlug();
  if (slug === undefined) {
    if (envParticipate) {
      logger.warn("Registry opt-in enabled but host slug is missing; skipping registration");
    }
    return;
  }

  const registryUrl = effective.registryUrl ?? envRegistryUrl() ?? DEFAULT_REGISTRY_URL;
  const baseUrl = effective.publicBaseUrl ?? envPublicBaseUrl(envPort());
  const displayName = effective.displayName ?? envHostDisplayName();
  const stored = hostSpec.read();

  if (envParticipate || stored?.slug !== undefined) {
    void registerHostWithRegistry({
      registryUrl,
      slug,
      baseUrl,
      ...(displayName !== undefined ? { displayName } : {}),
    });
  }

  const registrationSecret = stored?.registrationSecret;
  if (registrationSecret !== undefined && hostSpec.readEffective().managementToken === undefined) {
    void (async () => {
      try {
        const remote = await fetchHostRegistrationStatus(
          toRegistryClientConfig({
            registryUrl,
            slug,
            publicBaseUrl: baseUrl,
            ...(displayName !== undefined ? { displayName } : {}),
            registrationSecret,
          }),
        );
        if (remote.managementToken !== undefined) {
          hostSpec.storeSecrets({ managementToken: remote.managementToken });
          hostSpec.clearRegistrationSecret();
          logger.info({ slug, registryUrl }, "registry: stored pending management token");
        }
      } catch (err) {
        logger.warn({ err, slug, registryUrl }, "registry: registration status poll failed");
      }
    })();
  }

  const effectiveToken = hostSpec.readEffective().managementToken;
  if (effectiveToken !== undefined) {
    void (async () => {
      try {
        await syncHostRegistryOnStartup(
          toRegistryClientConfig({
            registryUrl,
            slug,
            publicBaseUrl: baseUrl,
            ...(displayName !== undefined ? { displayName } : {}),
            managementToken: effectiveToken,
          }),
        );
        logger.info({ slug, registryUrl }, "registry: synced trusted origins");
      } catch (err) {
        logger.warn({ err, slug, registryUrl }, "registry: trusted origin sync failed");
      }
    })();
  }
}
