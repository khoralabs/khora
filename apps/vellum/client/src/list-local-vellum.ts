import fs from "node:fs";
import path from "node:path";

import { cfgDataDir, obpStoreRoot, type VellumPathConfig } from "@khoralabs/vellum-contracts";

export type LocalVellumRow = {
  roomId: string;
  pid?: number;
  controlPort?: number;
  status: "running" | "stale" | "no-control-file" | "invalid-control-file";
};

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Inspect `vellum.json` under each `{obpRoot}/rooms/*` dir (aligned with daemon layout).
 */
export function listLocalVellumRows(
  cfg: VellumPathConfig,
  env: NodeJS.ProcessEnv = process.env,
): LocalVellumRow[] {
  const roomsRoot = path.join(obpStoreRoot(cfgDataDir(cfg), env), "rooms");
  let names: string[] = [];
  try {
    names = fs.readdirSync(roomsRoot);
  } catch {
    return [];
  }
  names.sort();
  const out: LocalVellumRow[] = [];
  for (const enc of names) {
    const sub = path.join(roomsRoot, enc);
    let st: fs.Stats;
    try {
      st = fs.statSync(sub);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    let roomId: string;
    try {
      roomId = decodeURIComponent(enc);
    } catch {
      continue;
    }

    const ctlPath = path.join(sub, "vellum.json");
    if (!fs.existsSync(ctlPath)) {
      out.push({ roomId, status: "no-control-file" });
      continue;
    }
    let raw: string;
    try {
      raw = fs.readFileSync(ctlPath, "utf8");
    } catch {
      out.push({ roomId, status: "no-control-file" });
      continue;
    }
    let j: unknown;
    try {
      j = JSON.parse(raw) as unknown;
    } catch {
      out.push({ roomId, status: "invalid-control-file" });
      continue;
    }
    if (j === null || typeof j !== "object") {
      out.push({ roomId, status: "invalid-control-file" });
      continue;
    }
    const o = j as Record<string, unknown>;
    const pid = o.pid;
    const controlPort = o.controlPort;
    if (
      typeof pid !== "number" ||
      !Number.isFinite(pid) ||
      typeof controlPort !== "number" ||
      !Number.isFinite(controlPort)
    ) {
      out.push({ roomId, status: "invalid-control-file" });
      continue;
    }
    out.push({
      roomId,
      pid,
      controlPort,
      status: isPidAlive(pid) ? "running" : "stale",
    });
  }
  return out;
}
