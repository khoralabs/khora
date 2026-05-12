import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { daemonLogPath, readDaemonStatus } from "@khoralabs/atrium-daemon";
import { cliAppConfig } from "../app-config.ts";
import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

const DAEMON_BIN_SPEC = "@khoralabs/atrium-daemon/bin";
const ACK_TIMEOUT_MS = 1500;
const ACK_POLL_MS = 50;

function resolveDaemonScript(): string {
  return Bun.fileURLToPath(import.meta.resolve(DAEMON_BIN_SPEC));
}

function buildPassthroughArgs(flags: FlagMap): string[] {
  const out: string[] = [];
  const cfg = strFlag(flags, "config");
  if (cfg !== undefined) out.push("--config", cfg);
  if (boolFlag(flags, "json")) out.push("--json");
  return out;
}

async function waitForRunning(
  pollFn: () => ReturnType<typeof readDaemonStatus>,
  timeoutMs: number,
): Promise<ReturnType<typeof readDaemonStatus>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = pollFn();
    if (s.state === "running") return s;
    await Bun.sleep(ACK_POLL_MS);
  }
  return pollFn();
}

export async function runStartCommand(flags: FlagMap): Promise<void> {
  const preflight = readDaemonStatus(cliAppConfig);
  if (preflight.state === "running") {
    console.error(
      `daemon already running (pid ${preflight.pid}) — use 'atrium kill' to stop it`,
    );
    process.exit(1);
  }

  const background = boolFlag(flags, "background", "b");
  const passthrough = buildPassthroughArgs(flags);
  const daemonScript = resolveDaemonScript();
  const cmd = ["bun", "run", daemonScript, ...passthrough];

  if (!background) {
    const proc = Bun.spawn(cmd, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: process.env,
    });
    const forward = (sig: NodeJS.Signals) => proc.kill(sig);
    process.on("SIGINT", () => forward("SIGINT"));
    process.on("SIGTERM", () => forward("SIGTERM"));
    process.exit(await proc.exited);
  }

  const logPath = daemonLogPath(cliAppConfig, strFlag(flags, "log"));
  await mkdir(path.dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "a", 0o644);
  const proc = Bun.spawn(cmd, {
    stdin: "ignore",
    stdout: fd,
    stderr: fd,
    env: process.env,
  });
  proc.unref();

  const status = await waitForRunning(() => readDaemonStatus(cliAppConfig), ACK_TIMEOUT_MS);
  if (status.state !== "running") {
    console.error(`daemon failed to start; check log: ${logPath}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ pid: status.pid, log: logPath }));
}
