import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");

export type E2eStack = {
  registryUrl: string;
  serverUrl: string;
  hostSlug: string;
  registryLog: () => string;
  stop: () => Promise<void>;
};

function randomPort(base: number): number {
  return base + Math.floor(Math.random() * 1000);
}

async function waitForUrl(
  url: string,
  opts: { attempts?: number; intervalMs?: number; accept?: (status: number) => boolean },
): Promise<void> {
  const attempts = opts.attempts ?? 60;
  const intervalMs = opts.intervalMs ?? 250;
  const accept = opts.accept ?? ((s) => s >= 200 && s < 500);
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (accept(res.status)) return;
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await Bun.sleep(intervalMs);
  }
  throw new Error(`timed out waiting for ${url}: ${lastErr}`);
}

function collectStream(
  stream: ReadableStream<Uint8Array> | null,
  onChunk: (text: string) => void,
): void {
  if (stream === null) return;
  void (async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  })();
}

async function killProc(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
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
  }
}

/** Spawn registry + server with temp data dirs and random ports. */
export async function startE2eStack(opts?: { hostSlug?: string }): Promise<E2eStack> {
  const hostSlug = opts?.hostSlug ?? "e2e";
  const registryPort = randomPort(14000);
  const serverPort = randomPort(18788);
  const registryUrl = `http://127.0.0.1:${registryPort}`;
  const serverUrl = `http://127.0.0.1:${serverPort}`;

  const registryData = mkdtempSync(path.join(tmpdir(), "khora-e2e-registry-"));
  const serverData = mkdtempSync(path.join(tmpdir(), "khora-e2e-server-"));

  let registryLogBuf = "";
  const appendRegistryLog = (t: string) => {
    registryLogBuf += t;
  };

  const registryEnv: Record<string, string> = {
    ...process.env,
    PORT: String(registryPort),
    REGISTRY_URL: registryUrl,
    REGISTRY_DATABASE_PATH: path.join(registryData, "registry.sqlite"),
    BETTER_AUTH_SECRET: "e2e-better-auth-secret-32chars!!",
    REGISTRY_SQLCIPHER_KEY: "e2e-registry-sqlcipher-key!",
    REGISTRY_AUTH_OTP_LOG: "1",
    REGISTRY_REGISTRATION_TRUST: "open",
    REGISTRY_CONSOLE_ROOT_TOKEN: "e2e-registry-console-token",
    REGISTRY_HOST_HEALTH_POLL_DISABLED: "1",
    LOG_LEVEL: "info",
  };

  const serverEnv: Record<string, string> = {
    ...process.env,
    PORT: String(serverPort),
    KHORA_DATA_DIR: serverData,
    KHORA_OUTBOX_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    KHORA_SQLCIPHER_KEY: "e2e-khora-sqlcipher-key!!",
    KHORA_CONSOLE_ROOT_TOKEN: "e2e-khora-console-token",
    KHORA_REGISTRY_URL: registryUrl,
    KHORA_HOST_SLUG: hostSlug,
    KHORA_PUBLIC_BASE_URL: serverUrl,
    KHORA_COLONNADE_CELL_WORKERS: "0",
    LOG_LEVEL: "error",
  };

  const registryProc = Bun.spawn({
    cmd: ["bun", "run", path.join(workspaceRoot, "apps/registry/src/index.ts")],
    cwd: registryData,
    env: registryEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  collectStream(registryProc.stdout, appendRegistryLog);
  collectStream(registryProc.stderr, appendRegistryLog);

  const serverProc = Bun.spawn({
    cmd: ["bun", "run", path.join(workspaceRoot, "apps/server/src/index.ts")],
    cwd: serverData,
    env: serverEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  let serverLogBuf = "";
  collectStream(serverProc.stdout, (t) => {
    serverLogBuf += t;
  });
  collectStream(serverProc.stderr, (t) => {
    serverLogBuf += t;
  });

  try {
    await waitForUrl(`${registryUrl}/health`, {
      accept: (s) => s === 200,
    });
    await waitForUrl(`${serverUrl}/.well-known/khora`, {
      accept: (s) => s === 200 || s === 404,
    });
    await waitForUrl(`${serverUrl}/health`, {
      accept: (s) => s === 200,
    });
  } catch (e) {
    await killProc(registryProc);
    await killProc(serverProc);
    rmSync(registryData, { recursive: true, force: true });
    rmSync(serverData, { recursive: true, force: true });
    throw new Error(
      `${e instanceof Error ? e.message : String(e)}\n--- registry ---\n${registryLogBuf.slice(-4000)}\n--- server ---\n${serverLogBuf.slice(-4000)}`,
    );
  }

  return {
    registryUrl,
    serverUrl,
    hostSlug,
    registryLog: () => registryLogBuf,
    stop: async () => {
      await killProc(serverProc);
      await killProc(registryProc);
      rmSync(registryData, { recursive: true, force: true });
      rmSync(serverData, { recursive: true, force: true });
    },
  };
}
