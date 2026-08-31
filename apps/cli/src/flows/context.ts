import fs from "node:fs";
import { createReadlineSession, type FlagMap, type ReadLineFn } from "@khoralabs/cli-kit";
import { loadIdentity, type PersistableSigner } from "@khoralabs/did-key-identity";
import { DEFAULT_KHORA_BASE_URL, defaultIdentityPath, KhoraClient } from "@khoralabs/khora-client";
import { khoraCliResolvedConfig } from "../khora-app-config";
import { agentKeyPathFromFlags, baseUrlFromFlags, hostSlugFromFlags } from "../lib/flags";

export type KhoraCliContext = {
  readLine: ReadLineFn;
  closeReadline: () => void;
};

export function createKhoraCliContext(): KhoraCliContext {
  const { readLine, close } = createReadlineSession();
  return { readLine, closeReadline: close };
}

/**
 * Throw if KHORA_NO_INTERACTIVE=1 is set, preventing commands from hanging in
 * non-TTY shells (scripts, agent callers, CI). Pass a message describing which
 * flags would satisfy the command non-interactively.
 */
export function assertInteractiveAllowed(nonInteractiveHint: string): void {
  if (process.env.KHORA_NO_INTERACTIVE === "1") {
    throw new Error(`Interactive mode is disabled (KHORA_NO_INTERACTIVE=1). ${nonInteractiveHint}`);
  }
}

export function readJsonArg(pathOrInline: string): unknown {
  if (pathOrInline.startsWith("@")) {
    const p = pathOrInline.slice(1);
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as unknown;
  }
  return JSON.parse(pathOrInline) as unknown;
}

export type ResolvedCliHost = {
  slug: string | null;
  baseUrl: string;
};

export function resolveCliHost(flags: FlagMap): ResolvedCliHost {
  const cfg = khoraCliResolvedConfig(flags);
  const baseUrlFlag = baseUrlFromFlags(flags);
  const hostFlag = hostSlugFromFlags(flags);

  if (baseUrlFlag !== undefined && baseUrlFlag.length > 0) {
    return {
      slug: hostFlag ?? cfg.currentHost ?? null,
      baseUrl: baseUrlFlag,
    };
  }

  const slug = hostFlag ?? cfg.currentHost ?? null;
  if (slug !== null && slug.length > 0) {
    const entry = cfg.hosts?.[slug];
    if (entry?.baseUrl !== undefined) {
      return { slug, baseUrl: entry.baseUrl };
    }
  }

  if (cfg.baseUrl !== undefined) {
    return { slug, baseUrl: cfg.baseUrl };
  }

  return { slug, baseUrl: DEFAULT_KHORA_BASE_URL };
}

export function cliBaseUrl(flags: FlagMap): string {
  return resolveCliHost(flags).baseUrl;
}

export function cliCurrentHostSlug(flags: FlagMap): string | undefined {
  const slug = resolveCliHost(flags).slug;
  return slug !== null && slug.length > 0 ? slug : undefined;
}

export function agentIdentityPath(flags: FlagMap): string {
  const fromFlag = agentKeyPathFromFlags(flags);
  if (fromFlag !== undefined) return fromFlag;
  const cfg = khoraCliResolvedConfig(flags);
  const p = cfg.agentKeyPath?.trim();
  return p !== undefined && p.length > 0 ? p : defaultIdentityPath();
}

export async function withKhoraClient<T>(
  flags: FlagMap,
  fn: (client: KhoraClient) => Promise<T>,
): Promise<T> {
  const signer = await loadSigner(flags);
  const client = new KhoraClient({ baseUrl: cliBaseUrl(flags), signer });
  try {
    return await fn(client);
  } finally {
    client.dispose();
  }
}

export async function loadSigner(flags: FlagMap): Promise<PersistableSigner> {
  const idPath = agentIdentityPath(flags);
  const signer = await loadIdentity(idPath);
  if (signer === undefined) {
    throw new Error(`identity not found at ${idPath}`);
  }
  return signer;
}
