import fs from "node:fs";
import path from "node:path";

export type KhoraDaemonControlFile = {
  pid: number;
  did: string;
  baseUrl: string;
  startedAtMs: number;
};

export const KHORA_DAEMON_PID_FILENAME = "khora-daemon.json";

export function khoraDaemonPidPath(dataDir: string): string {
  return path.join(dataDir, KHORA_DAEMON_PID_FILENAME);
}

export function writeKhoraDaemonControlFile(dataDir: string, state: KhoraDaemonControlFile): void {
  const p = khoraDaemonPidPath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state)}\n`, "utf8");
}

export function removeKhoraDaemonControlFile(dataDir: string): void {
  try {
    fs.unlinkSync(khoraDaemonPidPath(dataDir));
  } catch {
    // ignore
  }
}

export function readKhoraDaemonControlFile(dataDir: string): KhoraDaemonControlFile | undefined {
  try {
    const raw = fs.readFileSync(khoraDaemonPidPath(dataDir), "utf8");
    const j = JSON.parse(raw) as unknown;
    if (j !== null && typeof j === "object") {
      const o = j as Record<string, unknown>;
      const pid = o.pid;
      const did = o.did;
      const baseUrl = o.baseUrl;
      const startedAtMs = o.startedAtMs;
      if (
        typeof pid === "number" &&
        Number.isFinite(pid) &&
        typeof did === "string" &&
        did.length > 0 &&
        typeof baseUrl === "string" &&
        baseUrl.length > 0 &&
        typeof startedAtMs === "number" &&
        Number.isFinite(startedAtMs)
      ) {
        return { pid, did, baseUrl, startedAtMs };
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
