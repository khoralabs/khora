import fs from "node:fs";

import {
  defaultIdentityPath,
  loadIdentity,
  type PersistableAgentSigner,
} from "@khoralabs/agent-persisted-signer";
import { createReadlineSession, type FlagMap, type ReadLineFn, strFlag } from "@khoralabs/cli-kit";
import { VELLUM_CANONICAL_BASE_URL, VellumClient } from "@khoralabs/vellum-client";

import { vellumCliResolvedConfig } from "../vellum-app-config.ts";

export type VellumCliContext = {
  readLine: ReadLineFn;
  closeReadline: () => void;
};

export function createVellumCliContext(): VellumCliContext {
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
  const cfg = vellumCliResolvedConfig(flags);
  return (
    strFlag(flags, "base-url") ??
    strFlag(flags, "baseUrl") ??
    cfg.baseUrl ??
    VELLUM_CANONICAL_BASE_URL
  );
}

export function agentIdentityPath(flags: FlagMap): string {
  const cfg = vellumCliResolvedConfig(flags);
  const p = cfg.agentKeyPath?.trim();
  return p !== undefined && p.length > 0 ? p : defaultIdentityPath();
}

export function dataDirForEnv(flags: FlagMap): string | undefined {
  const cfg = vellumCliResolvedConfig(flags);
  const d = strFlag(flags, "data-dir") ?? strFlag(flags, "dataDir") ?? cfg.dataDir;
  const t = d?.trim();
  return t !== undefined && t.length > 0 ? t : undefined;
}

/** Room from flag, config, env (via merged config), or optional positional. */
export function resolveRoomId(flags: FlagMap, roomPositional?: string | undefined): string {
  const cfg = vellumCliResolvedConfig(flags);
  const fromArg = roomPositional?.trim();
  if (fromArg !== undefined && fromArg.length > 0) return fromArg;
  const fromFlag = strFlag(flags, "room")?.trim();
  if (fromFlag !== undefined && fromFlag.length > 0) return fromFlag;
  const fromCfg = cfg.defaultRoomId?.trim();
  if (fromCfg !== undefined && fromCfg.length > 0) return fromCfg;
  return "";
}

export function makeVellumClient(flags: FlagMap, roomId: string): VellumClient {
  return new VellumClient({
    baseUrl: cliBaseUrl(flags),
    roomId,
    dataDir: dataDirForEnv(flags),
  });
}

export async function loadSigner(flags: FlagMap): Promise<PersistableAgentSigner> {
  const idPath = agentIdentityPath(flags);
  const signer = await loadIdentity(idPath);
  if (signer === undefined) {
    throw new Error(`identity not found at ${idPath}`);
  }
  return signer;
}
