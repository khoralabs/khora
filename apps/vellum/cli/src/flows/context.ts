import fs from "node:fs";

import { defaultIdentityPath, loadIdentity } from "@khoralabs/agent-persisted-signer";
import {
  createReadlineSession,
  type FlagMap,
  type ReadLineFn,
  strFlag,
} from "@khoralabs/cli-kit";
import { VellumClient } from "@khoralabs/vellum-client";

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
  return (
    strFlag(flags, "base-url") ??
    strFlag(flags, "baseUrl") ??
    process.env.VELLUM_BASE_URL ??
    process.env.VELLUM_ATRIUM_BASE_URL ??
    process.env.AT2_BASE_URL ??
    "http://127.0.0.1:8787"
  );
}

export function agentIdentityPath(): string {
  return (
    process.env.AT2_AGENT_KEY_PATH?.trim() ??
    process.env.ATRIUM_AGENT_KEY_PATH?.trim() ??
    defaultIdentityPath()
  );
}

export function dataDirForEnv(flags: FlagMap): string | undefined {
  const d =
    strFlag(flags, "data-dir") ??
    strFlag(flags, "dataDir") ??
    process.env.AT2_DATA_DIR ??
    process.env.ATRIUM_DATA_DIR ??
    undefined;
  const t = d?.trim();
  return t !== undefined && t.length > 0 ? t : undefined;
}

/** Room from flag, env vars, or optional positional (caller passes connect’s second arg). */
export function resolveRoomId(flags: FlagMap, roomPositional?: string | undefined): string {
  const fromArg = roomPositional?.trim();
  if (fromArg !== undefined && fromArg.length > 0) return fromArg;
  const fromFlag = strFlag(flags, "room")?.trim();
  if (fromFlag !== undefined && fromFlag.length > 0) return fromFlag;
  return (
    process.env.VELLUM_ROOM_ID?.trim() ??
    process.env.ATRIUM_ROOM_ID?.trim() ??
    ""
  );
}

export function makeVellumClient(flags: FlagMap, roomId: string): VellumClient {
  return new VellumClient({
    baseUrl: cliBaseUrl(flags),
    roomId,
    dataDir: dataDirForEnv(flags),
  });
}

export async function loadSigner() {
  const idPath = agentIdentityPath();
  const signer = await loadIdentity(idPath);
  if (signer === undefined) {
    throw new Error(`identity not found at ${idPath}`);
  }
  return signer;
}
