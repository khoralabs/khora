import { type DaemonPidPathConfig, listRegisteredDaemons } from "@khoralabs/atrium-daemon";
import { cliAppConfig } from "../app-config.ts";
import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export type StatusCommandIo = {
  log(line: string): void;
  exit(code: number): never;
};

const DEFAULT_IO: StatusCommandIo = {
  log: (line) => console.log(line),
  exit: (code) => process.exit(code),
};

/** Pure entry point for tests. `cfg` and `io` injected so the singleton is not required. */
export function runStatusWith(flags: FlagMap, cfg: DaemonPidPathConfig, io: StatusCommandIo): void {
  const entries = listRegisteredDaemons(cfg);
  const hasStale = entries.some((e) => e.state === "stale");
  const hasRunning = entries.some((e) => e.state === "running");

  if (boolFlag(flags, "json")) {
    io.log(JSON.stringify({ entries, hasRunning, hasStale }, null, 2));
    if (hasStale) io.exit(2);
    return;
  }

  io.log("kind\tpid\tstate\troomId\tpidPath\tlogPath");
  for (const e of entries) {
    const pidCol = e.pid !== undefined ? String(e.pid) : "-";
    const roomCol = e.kind === "room" ? (e.roomId ?? "-") : "";
    io.log(`${e.kind}\t${pidCol}\t${e.state}\t${roomCol}\t${e.pidPath}\t${e.logPath}`);
  }
  if (!hasRunning) {
    io.log("No Atrium daemons running.");
  }
  if (hasStale) {
    io.log("Some PID files are stale — run 'atrium kill --all' or 'atrium kill' per daemon.");
    io.exit(2);
  }
}

export function runStatusCommand(flags: FlagMap): void {
  runStatusWith(flags, cliAppConfig, DEFAULT_IO);
}
