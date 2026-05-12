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
 *   3. First entry of `defaultPaths` that exists on disk — non-explicit
 *
 * `defaultPaths` defaults to `[defaultAtriumConfigPath()]`. The legacy `defaultPath` option is
 * kept as a thin alias (single-element array) for backward compatibility; if both are supplied,
 * `defaultPaths` wins.
 *
 * `undefined` is returned when nothing applies. Callers may treat ENOENT on an explicit path as
 * fatal; non-explicit resolutions are skipped silently when the file is missing.
 */
export function resolveAtriumConfigPath(
  opts: {
    flag?: string;
    env?: NodeJS.ProcessEnv;
    /** Single default path. Use `defaultPaths` for ordered fallback discovery. */
    defaultPath?: string;
    /** Ordered list of candidate default paths; first existing wins. */
    defaultPaths?: readonly string[];
    fsExists?: (p: string) => boolean;
  } = {},
): ResolvedAtriumConfigPath | undefined {
  const flag = opts.flag?.trim();
  if (flag !== undefined && flag.length > 0) return { path: flag, explicit: true };
  const envVal = opts.env?.ATRIUM_CONFIG?.trim();
  if (envVal !== undefined && envVal.length > 0) return { path: envVal, explicit: true };
  const exists = opts.fsExists ?? existsSync;
  const candidates =
    opts.defaultPaths ??
    (opts.defaultPath !== undefined ? [opts.defaultPath] : [defaultAtriumConfigPath()]);
  for (const candidate of candidates) {
    if (exists(candidate)) return { path: candidate, explicit: false };
  }
  return undefined;
}
