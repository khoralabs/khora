import { boolFlag, strFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

export const PKG_NAME = "@khoralabs/atrium-cli";
export const REGISTRY = "https://registry.npmjs.org";

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_UPDATE_AVAILABLE = 10;

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type UpdateResult = {
  current: string;
  latest: string;
  tag: string;
  hasUpdate: boolean;
  applied: boolean;
};

/** Read the version stamped into the binary by the node-shim launcher (or "dev" locally). */
export function currentVersion(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.ATRIUM_CLI_VERSION?.trim();
  return v !== undefined && v.length > 0 ? v : "dev";
}

export async function fetchLatestVersion(
  opts: { tag?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const tag = opts.tag ?? "latest";
  const f = opts.fetchImpl ?? fetch;
  const url = `${REGISTRY}/${PKG_NAME}/${tag}`;
  const r = await f(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
  });
  if (!r.ok) throw new Error(`registry returned ${r.status} for ${url}`);
  const body = (await r.json()) as { version?: string };
  if (typeof body.version !== "string" || body.version.length === 0) {
    throw new Error("registry response missing 'version' field");
  }
  return body.version;
}

/**
 * Decide which global package-manager command to run.
 * Priority: explicit flag > `npm_config_user_agent` > first match on PATH > "npm".
 */
export function detectPackageManager(opts: {
  flag?: string;
  env?: NodeJS.ProcessEnv;
  which?: (cmd: string) => boolean;
}): PackageManager {
  if (opts.flag !== undefined) {
    const f = opts.flag.toLowerCase();
    if (f === "npm" || f === "pnpm" || f === "yarn" || f === "bun") return f;
    throw new Error(`--manager: unknown package manager '${opts.flag}'`);
  }
  const ua = opts.env?.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";
  if (ua.startsWith("npm")) return "npm";
  const which = opts.which ?? (() => false);
  for (const m of ["npm", "pnpm", "yarn", "bun"] as const) {
    if (which(m)) return m;
  }
  return "npm";
}

/** Default `which` that uses Bun.which (treated as readonly). */
function defaultWhich(cmd: string): boolean {
  return Bun.which(cmd) !== null;
}

export function managerInstallArgs(mgr: PackageManager, spec: string): string[] {
  if (mgr === "npm") return ["install", "-g", spec];
  if (mgr === "pnpm") return ["add", "-g", spec];
  if (mgr === "yarn") return ["global", "add", spec];
  return ["install", "-g", spec];
}

/**
 * Compare two release versions matching the regex enforced by the release
 * pipeline: `\d+\.\d+\.\d+(?:-[\w.-]+)?`.
 *
 * Numeric segments are compared lexicographically by number; a prerelease
 * tail is always lower than a release with the same numeric segments
 * (1.2.3-next.1 < 1.2.3). The literal "dev" is treated as -Infinity so any
 * registry release counts as an update during local development.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  if (a === "dev") return -1;
  if (b === "dev") return 1;
  const aSplit = a.split("-", 2);
  const bSplit = b.split("-", 2);
  const aMain = aSplit[0] ?? "0.0.0";
  const bMain = bSplit[0] ?? "0.0.0";
  const aPre = aSplit[1];
  const bPre = bSplit[1];
  const aParts = aMain.split(".").map((n) => Number.parseInt(n, 10));
  const bParts = bMain.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  if (aPre === undefined && bPre === undefined) return 0;
  if (aPre === undefined) return 1;
  if (bPre === undefined) return -1;
  return aPre < bPre ? -1 : aPre > bPre ? 1 : 0;
}

export type RunUpdateDeps = {
  fetchImpl?: typeof fetch;
  spawnInstall?: (cmd: string, args: string[]) => Promise<number>;
  stopDaemon?: () => Promise<void>;
  which?: (cmd: string) => boolean;
  prompt?: (question: string) => Promise<boolean>;
  isTty?: boolean;
  out?: (line: string) => void;
  err?: (line: string) => void;
  exit?: (code: number) => void;
};

async function defaultSpawnInstall(cmd: string, args: string[]): Promise<number> {
  const proc = Bun.spawn([cmd, ...args], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
}

async function defaultStopDaemon(): Promise<void> {
  const { runKillCommand } = await import("./kill.ts");
  try {
    await runKillCommand({});
  } catch (_) {}
}

async function defaultPrompt(question: string): Promise<boolean> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(question)).trim().toLowerCase();
    return a === "y" || a === "yes";
  } finally {
    rl.close();
  }
}

export async function runUpdateCommand(flags: FlagMap, deps: RunUpdateDeps = {}): Promise<void> {
  const out = deps.out ?? ((line) => console.log(line));
  const err = deps.err ?? ((line) => console.error(line));
  const exit = deps.exit ?? ((code) => process.exit(code));

  const tag = strFlag(flags, "tag") ?? "latest";
  const asJson = boolFlag(flags, "json");
  const check = boolFlag(flags, "check");
  const apply = boolFlag(flags, "apply") || boolFlag(flags, "yes", "y");
  const managerFlag = strFlag(flags, "manager");

  const current = currentVersion();
  let latest: string;
  try {
    latest = await fetchLatestVersion({ tag, fetchImpl: deps.fetchImpl });
  } catch (e) {
    err(`update: failed to query npm registry (${e instanceof Error ? e.message : String(e)})`);
    return exit(EXIT_ERROR);
  }

  const hasUpdate = compareVersions(current, latest) < 0;
  const result: UpdateResult = { current, latest, tag, hasUpdate, applied: false };

  if (asJson && !apply) {
    out(JSON.stringify(result, null, 2));
    return exit(check && hasUpdate ? EXIT_UPDATE_AVAILABLE : EXIT_OK);
  }

  if (!asJson) {
    out(`current: ${current}`);
    out(`latest:  ${latest} (tag: ${tag})`);
    if (!hasUpdate) {
      out("Up to date.");
    } else if (check) {
      out("A new version is available. Install with: atrium update --apply");
    } else if (!apply) {
      out("A new version is available.");
    }
  }

  if (check) return exit(hasUpdate ? EXIT_UPDATE_AVAILABLE : EXIT_OK);
  if (!hasUpdate) return exit(EXIT_OK);

  let shouldApply = apply;
  if (!shouldApply) {
    const isTty = deps.isTty ?? Boolean(process.stdin.isTTY);
    if (!isTty) {
      if (asJson) out(JSON.stringify(result, null, 2));
      else out("Re-run with --apply (or --yes) to install.");
      return exit(EXIT_OK);
    }
    const prompt = deps.prompt ?? defaultPrompt;
    shouldApply = await prompt("Install now? [y/N] ");
    if (!shouldApply) {
      if (asJson) out(JSON.stringify(result, null, 2));
      return exit(EXIT_OK);
    }
  }

  let manager: PackageManager;
  try {
    manager = detectPackageManager({
      flag: managerFlag,
      env: process.env,
      which: deps.which ?? defaultWhich,
    });
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    return exit(EXIT_ERROR);
  }

  const spec = `${PKG_NAME}@${tag}`;
  const args = managerInstallArgs(manager, spec);

  if (!asJson) out(`Stopping daemon before install (best-effort)…`);
  try {
    await (deps.stopDaemon ?? defaultStopDaemon)();
  } catch (e) {
    err(`update: could not stop daemon (${e instanceof Error ? e.message : String(e)})`);
  }

  if (!asJson) out(`Running: ${manager} ${args.join(" ")}`);
  const code = await (deps.spawnInstall ?? defaultSpawnInstall)(manager, args);

  result.applied = code === 0;
  if (asJson) out(JSON.stringify(result, null, 2));
  return exit(code === 0 ? EXIT_OK : EXIT_ERROR);
}
