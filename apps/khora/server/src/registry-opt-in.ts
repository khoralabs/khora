import {
  envHostDisplayName,
  envHostSlug,
  envPort,
  envPublicBaseUrl,
  envRegistryManagementToken,
  envRegistryParticipate,
  envRegistryUrl,
} from "./env";
import { logger } from "./logger";
import { syncHostRegistryOnStartup } from "./registry-client";

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
    logger.info(
      { slug, registryUrl },
      "registry opt-in: host registered as pending; activate in registry admin",
    );
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

export function maybeRegistryOptInOnStartup(): void {
  if (!envRegistryParticipate()) {
    return;
  }

  const slug = envHostSlug();
  if (slug === undefined) {
    logger.warn(
      "KHORA_REGISTRY_PARTICIPATE is set but KHORA_HOST_SLUG is missing; skipping registration",
    );
    return;
  }

  const registryUrl = envRegistryUrl() ?? DEFAULT_REGISTRY_URL;
  const baseUrl = envPublicBaseUrl(envPort());
  const displayName = envHostDisplayName();

  void (async () => {
    await registerHostWithRegistry({
      registryUrl,
      slug,
      baseUrl,
      ...(displayName !== undefined ? { displayName } : {}),
    });
    if (envRegistryManagementToken() !== undefined) {
      try {
        await syncHostRegistryOnStartup();
        logger.info({ slug, registryUrl }, "registry: synced trusted origins");
      } catch (err) {
        logger.warn({ err, slug, registryUrl }, "registry: trusted origin sync failed");
      }
    }
  })();
}
