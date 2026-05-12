/**
 * One-call surface for the atrium-host startup path: parse env, write a YAML
 * config to a temp file, run restore, and start the replicator. Returns a
 * handle whose `stop()` should be wired into SIGTERM/SIGINT handlers, or
 * `undefined` when replication is disabled (no `LITESTREAM_S3_BUCKET`).
 *
 * Keep this module the only place that reads `process.env` for the
 * `LITESTREAM_*` block — the helpers in `./runner` and `./config` are pure.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type LitestreamConfigInput, renderLitestreamConfig } from "./config.ts";

/**
 * Absolute path to the binary vendored by `scripts/install-litestream.ts`.
 *
 * Anchored to this source file (not `process.cwd()`) because Render's start
 * command CDs into `apps/atrium/host` before invoking Bun, which would
 * otherwise double-prefix any relative default into
 * `apps/atrium/host/apps/atrium/host/.bin/litestream`. The install script
 * computes the same path the same way, so build and runtime resolve identically.
 */
const VENDORED_BIN_PATH = path.resolve(import.meta.dir, "../../../.bin/litestream");

import {
  type LitestreamReplicateHandle,
  restoreIfReplicaExists,
  startLitestreamReplicate,
} from "./runner.ts";

export { type LitestreamConfigInput, renderLitestreamConfig } from "./config.ts";
export {
  type LitestreamReplicateHandle,
  type ReplicateInput,
  type RestoreInput,
  restoreIfReplicaExists,
  startLitestreamReplicate,
} from "./runner.ts";

export type MaybeStartLitestreamOptions = {
  dbPath: string;
  env?: NodeJS.ProcessEnv;
  /** Default `apps/atrium/host/.bin/litestream` relative to repo root, resolved by the install script. */
  defaultBinPath?: string;
  logger?: Pick<Console, "log" | "warn">;
};

export type LitestreamHandle = LitestreamReplicateHandle & { configPath: string };

/** Return `true` when the env contains enough to configure replication. */
export function isLitestreamConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.LITESTREAM_S3_BUCKET === "string" && env.LITESTREAM_S3_BUCKET.trim().length > 0;
}

function readConfigFromEnv(
  env: NodeJS.ProcessEnv,
  dbPath: string,
): { config: LitestreamConfigInput; binPath: string; configPath: string } | undefined {
  if (!isLitestreamConfigured(env)) return undefined;

  const bucket = env.LITESTREAM_S3_BUCKET?.trim() ?? "";
  const prefixPath = env.LITESTREAM_S3_PATH?.trim() ?? "";
  const accessKeyId = env.LITESTREAM_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = env.LITESTREAM_SECRET_ACCESS_KEY?.trim() ?? "";

  const missing: string[] = [];
  if (bucket.length === 0) missing.push("LITESTREAM_S3_BUCKET");
  if (prefixPath.length === 0) missing.push("LITESTREAM_S3_PATH");
  if (accessKeyId.length === 0) missing.push("LITESTREAM_ACCESS_KEY_ID");
  if (secretAccessKey.length === 0) missing.push("LITESTREAM_SECRET_ACCESS_KEY");
  if (missing.length > 0) {
    throw new Error(
      `litestream: LITESTREAM_S3_BUCKET is set but these are missing: ${missing.join(", ")}`,
    );
  }

  const config: LitestreamConfigInput = {
    dbPath,
    bucket,
    path: prefixPath,
    accessKeyId,
    secretAccessKey,
    ...(env.LITESTREAM_S3_ENDPOINT?.trim() ? { endpoint: env.LITESTREAM_S3_ENDPOINT.trim() } : {}),
    ...(env.LITESTREAM_S3_FORCE_PATH_STYLE?.toLowerCase() === "true"
      ? { forcePathStyle: true }
      : {}),
    ...(env.LITESTREAM_S3_REGION?.trim() ? { region: env.LITESTREAM_S3_REGION.trim() } : {}),
    ...(env.LITESTREAM_SYNC_INTERVAL?.trim()
      ? { syncInterval: env.LITESTREAM_SYNC_INTERVAL.trim() }
      : {}),
    ...(env.LITESTREAM_SNAPSHOT_INTERVAL?.trim()
      ? { snapshotInterval: env.LITESTREAM_SNAPSHOT_INTERVAL.trim() }
      : {}),
    ...(env.LITESTREAM_RETENTION?.trim() ? { retention: env.LITESTREAM_RETENTION.trim() } : {}),
  };

  const binPath = env.LITESTREAM_BIN_PATH?.trim() || VENDORED_BIN_PATH;

  const configDir =
    env.LITESTREAM_CONFIG_DIR?.trim() || path.join(path.dirname(dbPath), ".litestream");
  const configPath = path.join(configDir, "config.yml");

  return { config, binPath, configPath };
}

/**
 * Restore from replica (if any) and start `litestream replicate`. Pre-conditions:
 * the DB file path's parent directory must be writable. Side effects:
 *
 * - Writes the rendered YAML to `${dirname(dbPath)}/.litestream/config.yml`
 *   (override with `LITESTREAM_CONFIG_DIR`).
 * - Spawns one child `litestream` process and keeps a handle for shutdown.
 */
export async function maybeStartLitestream(
  opts: MaybeStartLitestreamOptions,
): Promise<LitestreamHandle | undefined> {
  const env = opts.env ?? process.env;
  const log = opts.logger ?? console;

  const parsed = readConfigFromEnv(env, opts.dbPath);
  if (parsed === undefined) {
    log.log("[litestream] LITESTREAM_S3_BUCKET unset; replication disabled");
    return undefined;
  }
  const { config, binPath, configPath } = parsed;

  mkdirSync(path.dirname(configPath), { recursive: true });
  mkdirSync(path.dirname(opts.dbPath), { recursive: true });
  writeFileSync(configPath, renderLitestreamConfig(config), { mode: 0o600 });

  await restoreIfReplicaExists({ binPath, configPath, dbPath: opts.dbPath, logger: log });

  const handle = startLitestreamReplicate({
    binPath,
    configPath,
    logger: log,
    onExit: (code) => {
      log.warn(
        `[litestream] replicator exited unexpectedly (code=${code}); exiting host so Render restarts`,
      );
      process.exit(1);
    },
  });

  return { ...handle, configPath };
}
