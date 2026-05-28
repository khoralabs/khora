import fs from "node:fs";

import {
  defaultIdentityPath,
  loadIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/agent-persisted-signer";
import { createReadlineSession, type FlagMap, type ReadLineFn, strFlag } from "@khoralabs/cli-kit";
import { KhoraClient } from "@khoralabs/khora-client";

import { khoraCliResolvedConfig } from "../khora-app-config.ts";

const DEFAULT_BASE_URL = "http://127.0.0.1:8787";

export type KhoraCliContext = {
  readLine: ReadLineFn;
  closeReadline: () => void;
};

export function createKhoraCliContext(): KhoraCliContext {
  const { readLine, close } = createReadlineSession();
  return { readLine, closeReadline: close };
}

export function readJsonArg(pathOrInline: string): unknown {
  if (pathOrInline.startsWith("@")) {
    const p = pathOrInline.slice(1);
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as unknown;
  }
  return JSON.parse(pathOrInline) as unknown;
}

export function cliBaseUrl(flags: FlagMap): string {
  const cfg = khoraCliResolvedConfig(flags);
  return strFlag(flags, "base-url") ?? strFlag(flags, "baseUrl") ?? cfg.baseUrl ?? DEFAULT_BASE_URL;
}

export function agentIdentityPath(flags: FlagMap): string {
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

export async function loadSigner(flags: FlagMap): Promise<PersistableAgentSigner> {
  const idPath = agentIdentityPath(flags);
  const signer = await loadIdentity(idPath);
  if (signer === undefined) {
    throw new Error(`identity not found at ${idPath}`);
  }
  return signer;
}
