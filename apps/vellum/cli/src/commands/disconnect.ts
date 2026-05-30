import fs from "node:fs";

import type { FlagMap } from "@khoralabs/cli-kit";
import { roomVellumControlPath } from "@khoralabs/vellum-contracts";

import { dataDirForEnv } from "../flows/context";

/** Stop local daemon if control file exists. Returns whether a control file was cleaned up. */
export function disconnectLocalRoom(flags: FlagMap, roomId: string): boolean {
  const ctlPath = roomVellumControlPath(dataDirForEnv(flags), roomId);
  if (!fs.existsSync(ctlPath)) {
    return false;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(ctlPath, "utf8");
  } catch {
    fs.unlinkSync(ctlPath);
    return true;
  }
  let j: unknown;
  try {
    j = JSON.parse(raw) as unknown;
  } catch {
    fs.unlinkSync(ctlPath);
    return true;
  }
  const pid =
    j !== null && typeof j === "object" && typeof (j as Record<string, unknown>).pid === "number"
      ? ((j as Record<string, unknown>).pid as number)
      : undefined;
  if (pid !== undefined && Number.isFinite(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ESRCH" && code !== "EPERM") throw e;
    }
  }
  fs.unlinkSync(ctlPath);
  return true;
}

export function handleDisconnect(positional: string[], flags: FlagMap): void {
  const roomId = positional[1]?.trim();
  if (roomId === undefined || roomId.length === 0) {
    throw new Error("room id required");
  }
  if (!disconnectLocalRoom(flags, roomId)) {
    console.log("(no local daemon control file)");
    return;
  }
  console.log(`disconnected local daemon for room ${roomId}`);
}
