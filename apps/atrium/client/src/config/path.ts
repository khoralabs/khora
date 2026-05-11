import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** `${HOME}/.atrium/config.json` — the auto-discovered default. */
export function defaultAtriumConfigPath(): string {
  return path.join(homedir(), ".atrium", "config.json");
}

export type ResolvedAtriumConfigPath = {
  /** Absolute (or as-supplied) path to the entry config file. */
  path: string;
  /** `true` when the path came from `--config` or `ATRIUM_CONFIG`; `false` for auto-discovery. */
  explicit: boolean;
};

/**
 * Resolve the entry config-file path the loader should read.
 *
 * Priority (first hit wins):
 *   1. `flag` (e.g. `--config <path>`) — explicit
 *   2. `env.ATRIUM_CONFIG` — explicit
 *   3. `defaultPath` if the file exists on disk — non-explicit
 *
 * `undefined` is returned when nothing applies. Callers may treat ENOENT on an explicit path as
 * fatal; non-explicit resolutions are skipped silently when the file is missing.
 */
export function resolveAtriumConfigPath(opts: {
  flag?: string;
  env?: NodeJS.ProcessEnv;
  defaultPath?: string;
  fsExists?: (p: string) => boolean;
} = {}): ResolvedAtriumConfigPath | undefined {
  const flag = opts.flag?.trim();
  if (flag !== undefined && flag.length > 0) return { path: flag, explicit: true };
  const envVal = opts.env?.ATRIUM_CONFIG?.trim();
  if (envVal !== undefined && envVal.length > 0) return { path: envVal, explicit: true };
  const def = opts.defaultPath ?? defaultAtriumConfigPath();
  const exists = opts.fsExists ?? existsSync;
  if (exists(def)) return { path: def, explicit: false };
  return undefined;
}
