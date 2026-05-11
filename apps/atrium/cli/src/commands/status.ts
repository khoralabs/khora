import { type DaemonPidPathConfig, readDaemonStatus } from "@cfd/atrium-daemon";
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
  const status = readDaemonStatus(cfg);
  if (boolFlag(flags, "json")) {
    io.log(JSON.stringify(status));
    if (status.state === "stale") io.exit(2);
    if (status.state === "not-running") io.exit(3);
    return;
  }
  if (status.state === "running") {
    io.log(`running pid=${status.pid} log=${status.logPath}`);
    return;
  }
  if (status.state === "stale") {
    io.log(
      `stale pid=${status.pid} (process gone) — run 'atrium kill' to clear ${status.pidPath}`,
    );
    io.exit(2);
  }
  io.log("not running");
  io.exit(3);
}

export function runStatusCommand(flags: FlagMap): void {
  runStatusWith(flags, cliAppConfig, DEFAULT_IO);
}
