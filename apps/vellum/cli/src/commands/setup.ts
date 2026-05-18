import { existsSync } from "node:fs";
import path from "node:path";

import { boolFlag } from "@khoralabs/cli-kit";
import type { FlagMap } from "@khoralabs/cli-kit";

import { runVellumConfigSetup, type VellumSetupResult } from "../../scripts/postinstall.ts";

const ASSETS_DIR_ENV = "VELLUM_CLI_ASSETS_DIR";

export type SetupAssets = {
  configsDir: string;
  schemaPath: string | undefined;
};

/**
 * Locate setup assets.
 *
 * Published install: the node-shim launcher exports `VELLUM_CLI_ASSETS_DIR`
 * pointing at the meta-package root.
 *
 * Monorepo dev: walks relative to this source file. Phase 2: schemaPath is
 * always `undefined` (added in Phase 3).
 */
export function resolveSetupAssets(env: NodeJS.ProcessEnv = process.env): SetupAssets {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return {
      configsDir: path.join(fromEnv, "configs"),
      schemaPath: undefined,
    };
  }
  const pkgRoot = path.resolve(import.meta.dir, "../..");
  return {
    configsDir: path.join(pkgRoot, "assets", "configs"),
    schemaPath: undefined,
  };
}

export function printSetupSummary(result: VellumSetupResult): void {
  for (const name of result.copied) console.log(`wrote ${name}`);
  for (const name of result.overwritten) console.log(`overwrote ${name}`);
  for (const name of result.skipped)
    console.log(`skipped ${name} (exists; use --force to overwrite)`);
  console.log(`at ${result.destDir}`);
}

export async function runSetupCommand(flags: FlagMap): Promise<void> {
  const force = boolFlag(flags, "force", "f");
  const asJson = boolFlag(flags, "json");
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home === undefined || home.length === 0) {
    throw new Error("HOME / USERPROFILE not set; cannot determine ~/.vellum location");
  }
  const result = runVellumConfigSetup({ home, force });
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else printSetupSummary(result);
}

/**
 * Run `vellum setup` automatically the first time the CLI is invoked from a
 * published install. Canary: existence of `~/.vellum/`.
 *
 * Best-effort: only runs when `VELLUM_CLI_ASSETS_DIR` is set (packaged install).
 * Failures are logged to stderr but never throw or block the command.
 */
export function maybeBootstrapVellumHome(
  env: NodeJS.ProcessEnv = process.env,
  err: (line: string) => void = (line) => console.error(line),
): void {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv === undefined || fromEnv.length === 0) return;
  const home = env.HOME ?? env.USERPROFILE;
  if (home === undefined || home.length === 0) return;
  const canary = path.join(home, ".vellum");
  if (existsSync(canary)) return;
  try {
    runVellumConfigSetup({ home, force: false });
  } catch (e) {
    err(
      `vellum: first-run setup failed (${e instanceof Error ? e.message : String(e)}); run 'vellum setup' to retry`,
    );
  }
}
