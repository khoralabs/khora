import { existsSync } from "node:fs";
import path from "node:path";
import {
  type AtriumSetupResult,
  runAtriumConfigSetup,
} from "../../scripts/postinstall.ts";
import { boolFlag } from "./parse.ts";
import type { FlagMap } from "./types.ts";

const ASSETS_DIR_ENV = "ATRIUM_CLI_ASSETS_DIR";
const SCHEMA_FILE = "atrium-config.schema.json";

export type SetupAssets = {
  configsDir: string;
  schemaPath: string | undefined;
};

/**
 * Locate the canonical config + schema assets the `setup` command should copy.
 *
 * Published install: the node-shim launcher exports `ATRIUM_CLI_ASSETS_DIR`
 * pointing at the meta-package root (which contains `configs/` and the schema).
 *
 * Monorepo dev: walk relative to this source file —
 *   configs live at `apps/atrium/cli/assets/configs/`
 *   schema lives at `apps/atrium/client/atrium-config.schema.json` (only present
 *   after `build:schema`; `schemaPath` resolves to `undefined` when missing).
 */
export function resolveSetupAssets(env: NodeJS.ProcessEnv = process.env): SetupAssets {
  const fromEnv = env[ASSETS_DIR_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    const schema = path.join(fromEnv, SCHEMA_FILE);
    return {
      configsDir: path.join(fromEnv, "configs"),
      schemaPath: existsSync(schema) ? schema : undefined,
    };
  }
  const pkgRoot = path.resolve(import.meta.dir, "../..");
  const schema = path.resolve(pkgRoot, "..", "client", SCHEMA_FILE);
  return {
    configsDir: path.join(pkgRoot, "assets", "configs"),
    schemaPath: existsSync(schema) ? schema : undefined,
  };
}

export function printSetupSummary(result: AtriumSetupResult): void {
  for (const name of result.copied) console.log(`wrote ${name}`);
  for (const name of result.overwritten) console.log(`overwrote ${name}`);
  for (const name of result.skipped) console.log(`skipped ${name} (exists; use --force to overwrite)`);
  if (result.schema === "copied") console.log(`wrote ${SCHEMA_FILE}`);
  else if (result.schema === "overwritten") console.log(`overwrote ${SCHEMA_FILE}`);
  else if (result.schema === "skipped") {
    console.log(`skipped ${SCHEMA_FILE} (exists; use --force to overwrite)`);
  } else {
    console.log(`skipped ${SCHEMA_FILE} (source not found; run 'bun run --cwd apps/atrium/client build:schema' in dev)`);
  }
  console.log(`at ${result.destDir}`);
}

export async function runSetupCommand(flags: FlagMap): Promise<void> {
  const force = boolFlag(flags, "force", "f");
  const asJson = boolFlag(flags, "json");
  const assets = resolveSetupAssets();
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home === undefined || home.length === 0) {
    throw new Error("HOME / USERPROFILE not set; cannot determine ~/.atrium location");
  }
  if (!existsSync(assets.configsDir)) {
    throw new Error(
      `setup: canonical configs directory not found at ${assets.configsDir} (set ${ASSETS_DIR_ENV} or run from a packaged install)`,
    );
  }
  const result = runAtriumConfigSetup({ ...assets, home, force });
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else printSetupSummary(result);
}
