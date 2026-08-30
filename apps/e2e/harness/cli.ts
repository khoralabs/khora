import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");
const cliEntry = path.join(workspaceRoot, "apps/cli/src/cli.ts");

type Spawned = ReturnType<typeof Bun.spawn>;

async function terminateProc(proc: Spawned): Promise<void> {
  try {
    proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  try {
    await Promise.race([proc.exited, Bun.sleep(3000)]);
  } catch {
    /* ignore */
  }
  if (proc.exitCode === null) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    try {
      await proc.exited;
    } catch {
      /* ignore */
    }
  }
}

export type CliAgent = {
  home: string;
  dataDir: string;
  run: (
    args: string[],
    opts?: { expectExit?: number; env?: Record<string, string> },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** Long-lived foreground `inbox listen --json` process. */
  startInboxListen: () => {
    log: () => string;
    stop: () => Promise<void>;
  };
  dispose: () => Promise<void>;
};

export type CreateCliAgentOpts = {
  registryUrl: string;
  serverUrl: string;
  label?: string;
};

/** Isolated HOME + env for one CLI agent against a live stack. */
export function createCliAgent(opts: CreateCliAgentOpts): CliAgent {
  const home = mkdtempSync(path.join(tmpdir(), `khora-e2e-home-${opts.label ?? "agent"}-`));
  const dataDir = path.join(home, ".khora", "data");
  const backgroundProcs = new Set<Spawned>();

  const baseEnv: Record<string, string> = {
    ...process.env,
    HOME: home,
    KHORA_REGISTRY_URL: opts.registryUrl,
    KHORA_BASE_URL: opts.serverUrl,
    KHORA_DATA_DIR: dataDir,
    KHORA_NO_INTERACTIVE: "1",
    KHORA_DAEMON_JSON: "1",
  };

  async function run(
    args: string[],
    runOpts?: { expectExit?: number; env?: Record<string, string> },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const proc = Bun.spawn({
      cmd: ["bun", "run", cliEntry, ...args],
      cwd: home,
      env: { ...baseEnv, ...runOpts?.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const code = exitCode ?? 1;
    const expectExit = runOpts?.expectExit ?? 0;
    if (code !== expectExit) {
      throw new Error(
        `khora ${args.join(" ")} exited ${code} (expected ${expectExit})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }
    return { stdout, stderr, exitCode: code };
  }

  function startInboxListen(): { log: () => string; stop: () => Promise<void> } {
    let buf = "";
    const append = (t: string) => {
      buf += t;
    };
    const collect = (stream: ReadableStream<Uint8Array> | null) => {
      if (stream === null) return;
      void (async () => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          append(decoder.decode(value, { stream: true }));
        }
      })();
    };
    const proc = Bun.spawn({
      cmd: ["bun", "run", cliEntry, "inbox", "listen", "--json"],
      cwd: home,
      env: baseEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    backgroundProcs.add(proc);
    collect(proc.stdout);
    collect(proc.stderr);
    return {
      log: () => buf,
      stop: async () => {
        backgroundProcs.delete(proc);
        await terminateProc(proc);
      },
    };
  }

  return {
    home,
    dataDir,
    run,
    startInboxListen,
    dispose: async () => {
      const pending = [...backgroundProcs];
      backgroundProcs.clear();
      await Promise.all(pending.map((p) => terminateProc(p)));
      rmSync(home, { recursive: true, force: true });
    },
  };
}
