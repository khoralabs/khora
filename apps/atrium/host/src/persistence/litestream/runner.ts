/**
 * Thin Bun.spawn wrappers for the two Litestream invocations atrium-host uses:
 *
 *  - `restoreIfReplicaExists` is a one-shot DR hook that must finish before we
 *    open `bun:sqlite`. Failures are non-fatal — the normal first-boot case is
 *    "no replica yet" and `litestream restore -if-replica-exists` exits 0 on
 *    that path; we only log and continue.
 *
 *  - `startLitestreamReplicate` spawns the long-running replicator after the
 *    HTTP server is up. The parent (atrium-host) forwards SIGTERM/SIGINT so
 *    Render's shutdown signal triggers a clean WAL sync. If the child dies
 *    unexpectedly we call `onExit` so the host can crash out and let Render
 *    restart the whole service rather than serve writes that aren't being
 *    replicated.
 */
import type { Subprocess } from "bun";

export type RestoreInput = {
  binPath: string;
  configPath: string;
  dbPath: string;
  logger?: Pick<Console, "log" | "warn">;
};

export type ReplicateInput = {
  binPath: string;
  configPath: string;
  /** Called when the child exits before `stop()` is invoked. */
  onExit?: (code: number | null) => void;
  logger?: Pick<Console, "log" | "warn">;
  /** Override the underlying spawn (tests only). */
  spawn?: typeof Bun.spawn;
};

export type LitestreamReplicateHandle = {
  /** Send SIGTERM and await child exit. Idempotent. */
  stop(): Promise<void>;
  /** PID for diagnostics. `undefined` after `stop()`. */
  pid(): number | undefined;
};

export async function restoreIfReplicaExists(input: RestoreInput): Promise<void> {
  const log = input.logger ?? console;
  log.log(`[litestream] restoring ${input.dbPath} (-if-replica-exists -if-db-not-exists)`);
  const proc = Bun.spawn(
    [
      input.binPath,
      "restore",
      "-if-replica-exists",
      "-if-db-not-exists",
      "-config",
      input.configPath,
      input.dbPath,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    log.warn(`[litestream] restore exited ${code}; continuing with local DB (if any)`);
  }
}

export function startLitestreamReplicate(input: ReplicateInput): LitestreamReplicateHandle {
  const log = input.logger ?? console;
  const spawn = input.spawn ?? Bun.spawn;

  let stopping = false;
  const proc: Subprocess = spawn([input.binPath, "replicate", "-config", input.configPath], {
    stdout: "inherit",
    stderr: "inherit",
  });
  log.log(`[litestream] replicate started (pid=${proc.pid})`);

  let stopPromise: Promise<void> | undefined;
  const stop = async (): Promise<void> => {
    if (stopPromise !== undefined) return stopPromise;
    stopping = true;
    stopPromise = (async () => {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* already exited */
      }
      const code = await proc.exited;
      log.log(`[litestream] replicate stopped (exit=${code})`);
    })();
    return stopPromise;
  };

  void proc.exited.then((code) => {
    if (!stopping) {
      log.warn(`[litestream] replicate exited unexpectedly (code=${code})`);
      input.onExit?.(code);
    }
  });

  return {
    stop,
    pid() {
      return stopping ? undefined : proc.pid;
    },
  };
}
