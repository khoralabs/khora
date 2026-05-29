import type { FlagMap } from "@khoralabs/cli-kit";
import { boolFlag, strFlag, style } from "@khoralabs/cli-kit";

import { cliCurrentHostSlug, resolveCliHost } from "../flows/context.ts";
import { khoraCliResolvedConfig } from "../khora-app-config.ts";
import { patchCliConfigFile, resolveCliConfigWritePath } from "../lib/cli-config-write.ts";
import { fetchHosts, registerHost } from "../registry/client.ts";
import { cliRegistryUrl } from "../registry/config.ts";

export async function handleHostList(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const registryUrl = cliRegistryUrl(flags);
  const current = cliCurrentHostSlug(flags);
  const hosts = await fetchHosts(registryUrl);

  if (json) {
    console.log(JSON.stringify({ currentHost: current ?? null, hosts }, null, 2));
    return;
  }

  if (hosts.length === 0) {
    console.log("No active hosts in registry. Register with khora host register.");
    return;
  }

  for (const h of hosts) {
    const mark = h.slug === current ? style.bold(" (current)") : "";
    const name = h.displayName !== undefined ? ` — ${h.displayName}` : "";
    console.log(`${h.slug}${mark}${name}`);
    console.log(`  ${h.baseUrl}`);
  }
}

export async function handleHostUse(flags: FlagMap, slugArg: string | undefined): Promise<void> {
  const json = boolFlag(flags, "json");
  const slug = slugArg?.trim();
  if (slug === undefined || slug.length === 0) {
    throw new Error("Usage: khora host use <slug>");
  }

  const registryUrl = cliRegistryUrl(flags);
  const hosts = await fetchHosts(registryUrl);
  const found = hosts.find((h) => h.slug === slug);
  if (found === undefined) {
    throw new Error(`Host not found or not active: ${slug}. Run khora host list.`);
  }

  const configPath = resolveCliConfigWritePath(flags);
  const cfg = khoraCliResolvedConfig(flags);
  const hostsMap = {
    ...(cfg.hosts ?? {}),
    [slug]: {
      baseUrl: found.baseUrl,
      ...(found.displayName !== undefined ? { displayName: found.displayName } : {}),
    },
  };
  patchCliConfigFile(configPath, { currentHost: slug, hosts: hostsMap });

  if (json) {
    console.log(JSON.stringify({ currentHost: slug, baseUrl: found.baseUrl }, null, 2));
    return;
  }
  console.log(`Using host ${style.bold(slug)} (${found.baseUrl})`);
}

export function handleHostShow(flags: FlagMap): void {
  const json = boolFlag(flags, "json");
  const resolved = resolveCliHost(flags);
  if (json) {
    console.log(JSON.stringify(resolved, null, 2));
    return;
  }
  if (resolved.slug !== null) {
    console.log(`Host: ${resolved.slug}`);
  }
  console.log(`Base URL: ${resolved.baseUrl}`);
}

export async function handleHostRegister(flags: FlagMap): Promise<void> {
  const json = boolFlag(flags, "json");
  const slug = strFlag(flags, "slug")?.trim();
  const baseUrl = strFlag(flags, "base-url") ?? strFlag(flags, "baseUrl");
  const displayName = strFlag(flags, "display-name") ?? strFlag(flags, "displayName");
  const description = strFlag(flags, "description");

  if (slug === undefined || slug.length === 0 || baseUrl === undefined || baseUrl.length === 0) {
    throw new Error("host register requires --slug and --base-url");
  }

  const registryUrl = cliRegistryUrl(flags);
  const result = await registerHost(registryUrl, {
    slug,
    baseUrl,
    ...(displayName !== undefined ? { displayName } : {}),
    ...(description !== undefined ? { description } : {}),
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Registered host ${result.host.slug} (status: ${result.host.status})`);
  if (result.message !== undefined) {
    console.log(result.message);
  }
}
