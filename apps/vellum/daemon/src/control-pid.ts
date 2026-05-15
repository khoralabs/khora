import fs from "node:fs";
import path from "node:path";

import {
  cfgDataDir,
  roomVellumControlPath,
  type VellumPathConfig,
} from "@khoralabs/vellum-contracts";

export type VellumControlFile = {
  pid: number;
  controlPort: number;
  roomId: string;
};

export function vellumControlPath(
  cfg: VellumPathConfig,
  roomId: string,
  env?: NodeJS.ProcessEnv,
): string {
  return roomVellumControlPath(cfgDataDir(cfg), roomId, env);
}

export function writeVellumControlFile(
  cfg: VellumPathConfig,
  roomId: string,
  state: VellumControlFile,
): void {
  const p = vellumControlPath(cfg, roomId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state satisfies VellumControlFile)}\n`, "utf8");
}

/** Best-effort remove `vellum.json`. */
export function removeVellumControlFile(cfg: VellumPathConfig, roomId: string): void {
  try {
    fs.unlinkSync(vellumControlPath(cfg, roomId));
  } catch {
    // ignore
  }
}

/** Read `{ pid, controlPort, roomId }` written by daemon. */
export function readVellumControlFile(
  cfg: VellumPathConfig,
  roomId: string,
): VellumControlFile | undefined {
  try {
    const raw = fs.readFileSync(vellumControlPath(cfg, roomId), "utf8");
    const j = JSON.parse(raw) as unknown;
    if (j !== null && typeof j === "object") {
      const o = j as Record<string, unknown>;
      const pid = o.pid;
      const controlPort = o.controlPort;
      if (
        typeof pid === "number" &&
        Number.isFinite(pid) &&
        typeof controlPort === "number" &&
        Number.isFinite(controlPort)
      ) {
        return { pid, controlPort, roomId: typeof o.roomId === "string" ? o.roomId : roomId };
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}
