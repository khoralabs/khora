import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  envHostDisplayName,
  envHostSlug,
  envPort,
  envPublicBaseUrl,
  envRegistryManagementToken,
  envRegistryUrl,
} from "./env";
import { resolveKhoraPersistencePaths } from "./persistence-paths";

export type RegistryLocalConfig = {
  registryUrl?: string;
  slug?: string;
  publicBaseUrl?: string;
  displayName?: string;
  registrationSecret?: string;
  managementToken?: string;
};

function configPath(): string {
  return join(resolveKhoraPersistencePaths().dataDir, "registry-config.json");
}

function readFileConfig(): RegistryLocalConfig {
  try {
    const file = Bun.file(configPath());
    if (!(file.size > 0)) {
      return {};
    }
    return JSON.parse(String(file)) as RegistryLocalConfig;
  } catch {
    return {};
  }
}

function writeFileConfig(config: RegistryLocalConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  Bun.write(path, JSON.stringify(config, null, 2));
}

export function readRegistryLocalConfig(): RegistryLocalConfig {
  const file = readFileConfig();
  return {
    registryUrl: envRegistryUrl() ?? file.registryUrl,
    slug: envHostSlug() ?? file.slug,
    publicBaseUrl: file.publicBaseUrl ?? envPublicBaseUrl(envPort()),
    displayName: envHostDisplayName() ?? file.displayName,
    registrationSecret: file.registrationSecret,
    managementToken: envRegistryManagementToken() ?? file.managementToken,
  };
}

export function saveRegistryLocalConfig(
  patch: Partial<
    Pick<RegistryLocalConfig, "registryUrl" | "slug" | "publicBaseUrl" | "displayName">
  >,
): RegistryLocalConfig {
  const current = readFileConfig();
  const next: RegistryLocalConfig = {
    ...current,
    ...patch,
  };
  writeFileConfig(next);
  return readRegistryLocalConfig();
}

export function storeRegistrySecrets(secrets: {
  registrationSecret?: string;
  managementToken?: string;
}): RegistryLocalConfig {
  const current = readFileConfig();
  const next: RegistryLocalConfig = {
    ...current,
    ...(secrets.registrationSecret !== undefined
      ? { registrationSecret: secrets.registrationSecret }
      : {}),
    ...(secrets.managementToken !== undefined ? { managementToken: secrets.managementToken } : {}),
  };
  if (secrets.managementToken !== undefined) {
    delete next.registrationSecret;
  }
  writeFileConfig(next);
  return readRegistryLocalConfig();
}

export function clearRegistryRegistrationSecret(): RegistryLocalConfig {
  const current = readFileConfig();
  const next = { ...current };
  delete next.registrationSecret;
  writeFileConfig(next);
  return readRegistryLocalConfig();
}

export function readEffectiveRegistryConfig(): {
  registryUrl: string;
  slug: string | undefined;
  publicBaseUrl: string;
  displayName: string | undefined;
  registrationSecret: string | undefined;
  managementToken: string | undefined;
} {
  const config = readRegistryLocalConfig();
  return {
    registryUrl: config.registryUrl ?? "http://localhost:4000",
    slug: config.slug,
    publicBaseUrl: config.publicBaseUrl ?? envPublicBaseUrl(envPort()),
    displayName: config.displayName,
    registrationSecret: config.registrationSecret,
    managementToken: config.managementToken,
  };
}
