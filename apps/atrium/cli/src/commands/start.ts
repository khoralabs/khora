import { spawn as nodeSpawn } from "node:child_process";
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

/**
 * Resolve the path to the daemon executable.
 *
 * Published installs: `ATRIUM_DAEMON_BIN` is exported by the node-shim launcher
 * (see [apps/atrium/release/cli/bin/atrium.js](apps/atrium/release/cli/bin/atrium.js)),
 * which `require.resolve`s the matching native binary from the platform package.
 *
 * Local dev / monorepo: when the env var is unset we fall back to resolving the
 * daemon's TypeScript entrypoint via `import.meta.resolve` and run it through Bun.
 */
export function resolveDaemonInvocation(env: NodeJS.ProcessEnv = process.env): string[] {
  const envBin = env.ATRIUM_DAEMON_BIN?.trim();
  if (envBin !== undefined && envBin.length > 0) return [envBin];
  const script = Bun.fileURLToPath(import.meta.resolve(DAEMON_BIN_SPEC));
  return ["bun", "run", script];
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
    console.error(`daemon already running (pid ${preflight.pid}) — use 'atrium kill' to stop it`);
    process.exit(1);
  }

  const background = boolFlag(flags, "background", "b");
  const passthrough = buildPassthroughArgs(flags);
  const cmd = [...resolveDaemonInvocation(), ...passthrough];

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

  // Use node:child_process so we get `detached: true` (calls setsid() on
  // POSIX, putting the daemon in its own process group). Without this, a
  // SIGINT (Ctrl-C) in the user's shell propagates to the daemon, and the
  // daemon's stdout can leak back to the terminal under some platforms'
  // posix_spawn fd handling.
  const proc = nodeSpawn(cmd[0] as string, cmd.slice(1), {
    detached: true,
    stdio: ["ignore", fd, fd],
    env: process.env,
  });
  proc.unref();

  const status = await waitForRunning(() => readDaemonStatus(cliAppConfig), ACK_TIMEOUT_MS);
  if (status.state !== "running") {
    console.error(`daemon failed to start; check log: ${logPath}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ pid: status.pid, log: logPath }));
  // Defensive: explicitly exit so the CLI definitely returns the shell even
  // if some unref'd handle would otherwise keep the loop alive.
  process.exit(0);
}
