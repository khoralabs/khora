import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Pure library for the canonical home-dir setup for `~/.vellum/`.
 *
 * Imported by the compiled `vellum` binary (`commands/setup.ts`,
 * `maybeBootstrapVellumHome`) and bundled into the npm postinstall script
 * (`postinstall.entry.ts`). Must remain free of top-level side effects.
 *
 * Phase 2: CONFIG_FILES is empty — `runVellumConfigSetup` only ensures
 * `~/.vellum/` exists. Phase 3 will populate config files and schema.
 */

// Phase 2: no config files yet — populated in Phase 3.
const CONFIG_FILES: readonly string[] = [];

export type VellumSetupResult = {
  destDir: string;
  copied: string[];
  overwritten: string[];
  skipped: string[];
};

export type PostinstallResult = {
  destDir: string;
  copied: string[];
  skipped: string[];
};

/**
 * Ensures `~/.vellum/` exists and (in Phase 3) copies canonical config files.
 *
 * Idempotent by default — skips any file that already exists. With `force: true`
 * existing files are rewritten (Phase 3 behavior; no-op in Phase 2).
 */
export function runVellumConfigSetup(opts: {
  home: string;
  force?: boolean;
}): VellumSetupResult {
  const dest = path.join(opts.home, ".vellum");
  fs.mkdirSync(dest, { recursive: true });

  const copied: string[] = [];
  const overwritten: string[] = [];
  const skipped: string[] = [];

  // CONFIG_FILES is empty in Phase 2; Phase 3 will populate it.
  for (const _name of CONFIG_FILES) {
    void _name;
  }

  return { destDir: dest, copied, overwritten, skipped };
}

/**
 * Idempotent postinstall helper. Never overwrites existing files.
 */
export function runVellumPostinstall(opts: { home: string }): PostinstallResult {
  const setup = runVellumConfigSetup({ home: opts.home, force: false });
  return {
    destDir: setup.destDir,
    copied: setup.copied,
    skipped: setup.skipped,
  };
}
