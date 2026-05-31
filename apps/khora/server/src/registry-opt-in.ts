import type { KhoraHostContext, KhoraHostSpecPort } from "@khoralabs/khora-host";
import {
  envHostDisplayName,
  envHostSlug,
  envPort,
  envPublicBaseUrl,
  envRegistryParticipate,
  envRegistryUrl,
} from "./env";
import { logger } from "./logger";
import { fetchHostRegistrationStatus, syncHostRegistryOnStartup } from "./registry-client";

const DEFAULT_REGISTRY_URL = "http://localhost:4000";

export type RegistryOptInParams = {
  registryUrl: string;
  slug: string;
  baseUrl: string;
  displayName?: string;
  fetchImpl?: typeof fetch;
};

export async function registerHostWithRegistry(params: RegistryOptInParams): Promise<void> {
  const { registryUrl, slug, baseUrl, displayName, fetchImpl = fetch } = params;
  const url = `${registryUrl.replace(/\/$/, "")}/v1/hosts/register`;
  const body: Record<string, string> = { slug, baseUrl };
  if (displayName !== undefined) {
    body.displayName = displayName;
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.warn({ err, registryUrl, slug }, "registry opt-in: request failed");
    return;
  }

  const text = await res.text();
  if (res.status === 201) {
    logger.info({ slug, registryUrl }, "registry opt-in: host registered");
    return;
  }

  if (res.status === 409 || text.includes("already registered")) {
    logger.info({ slug, registryUrl }, "registry opt-in: host already registered");
    return;
  }

  logger.warn(
    { slug, registryUrl, status: res.status, body: text.slice(0, 500) },
    "registry opt-in: registration failed",
  );
}

export function maybeRegistryOptInOnStartup(
  hostSpec: KhoraHostSpecPort,
  _ctx?: KhoraHostContext,
): void {
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
        const remote = await fetchHostRegistrationStatus({
          registryUrl,
          slug,
          publicBaseUrl: baseUrl,
          ...(displayName !== undefined ? { displayName } : {}),
          registrationSecret,
        });
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
        await syncHostRegistryOnStartup({
          registryUrl,
          slug,
          publicBaseUrl: baseUrl,
          ...(displayName !== undefined ? { displayName } : {}),
          managementToken: effectiveToken,
        });
        logger.info({ slug, registryUrl }, "registry: synced trusted origins");
      } catch (err) {
        logger.warn({ err, slug, registryUrl }, "registry: trusted origin sync failed");
      }
    })();
  }
}
