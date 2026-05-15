import {
  type DaemonPidPathConfig,
  daemonLogPath,
  daemonPidPath,
  readDaemonStatus,
} from "./daemon-pid.ts";

export type RegisteredDaemonKind = "inbox";

export type RegisteredDaemonEntry = {
  kind: RegisteredDaemonKind;
  pid?: number;
  pidPath: string;
  logPath: string;
  state: "running" | "stale" | "not-running";
};

/**
 * Lists the inbox daemon registration with liveness state (including `not-running` when no file).
 */
export function listRegisteredDaemons(
  cfg: DaemonPidPathConfig,
  logOverride?: string,
): RegisteredDaemonEntry[] {
  const out: RegisteredDaemonEntry[] = [];

  const inbox = readDaemonStatus(cfg, logOverride);
  const inboxLog = daemonLogPath(cfg, logOverride);
  if (inbox.state === "not-running") {
    out.push({
      kind: "inbox",
      pidPath: daemonPidPath(cfg),
      logPath: inboxLog,
      state: "not-running",
    });
  } else if (inbox.state === "running") {
    out.push({
      kind: "inbox",
      pid: inbox.pid,
      pidPath: inbox.pidPath,
      logPath: inbox.logPath,
      state: "running",
    });
  } else {
    out.push({
      kind: "inbox",
      pid: inbox.pid,
      pidPath: inbox.pidPath,
      logPath: inbox.logPath,
      state: "stale",
    });
  }

  return out;
}

/** Map pid → inbox registry entry referencing that pid, if running. */
export function findRegistryEntriesByPid(
  cfg: DaemonPidPathConfig,
  pid: number,
  logOverride?: string,
): RegisteredDaemonEntry[] {
  return listRegisteredDaemons(cfg, logOverride).filter((e) => e.pid === pid);
}
