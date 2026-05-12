import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Pure library for the canonical-config drop into `~/.atrium/`.
 *
 * Imported by the compiled `atrium` binary (`commands/setup.ts`,
 * `maybeBootstrapAtriumHome`) and bundled into the npm postinstall script
 * (`postinstall.entry.ts`). Must remain free of top-level side effects so
 * importing it from the compiled CLI does not try to act as a postinstall.
 */

const CONFIG_FILES = ["base.config.json", "cli.config.json", "daemon.config.json"] as const;
const SCHEMA_FILE = "atrium-config.schema.json";

export type AtriumSetupSchemaStatus = "copied" | "overwritten" | "skipped" | "missing";

export type AtriumSetupResult = {
  destDir: string;
  copied: string[];
  overwritten: string[];
  skipped: string[];
  schema: AtriumSetupSchemaStatus;
};

export type PostinstallResult = {
  destDir: string;
  copied: string[];
  skipped: string[];
  schemaCopied: boolean;
};

/**
 * Shared file-IO for the canonical-config drop into `~/.atrium/`.
 *
 * Idempotent by default — skips any file that already exists. With `force: true`,
 * every config and the schema is rewritten unconditionally.
 *
 * Used by both [postinstall.ts](./postinstall.ts) (force=false) and the
 * `atrium setup` command (force=user-controlled).
 */
export function runAtriumConfigSetup(opts: {
  configsDir: string;
  schemaPath: string | undefined;
  home: string;
  force?: boolean;
}): AtriumSetupResult {
  const force = opts.force ?? false;
  const dest = path.join(opts.home, ".atrium");
  fs.mkdirSync(dest, { recursive: true });

  const copied: string[] = [];
  const overwritten: string[] = [];
  const skipped: string[] = [];

  for (const name of CONFIG_FILES) {
    const target = path.join(dest, name);
    const exists = fs.existsSync(target);
    if (exists && !force) {
      skipped.push(name);
      continue;
    }
    const src = path.join(opts.configsDir, name);
    let body = fs.readFileSync(src, "utf8");
    body = body.replaceAll("~/.atrium", dest);
    fs.writeFileSync(target, body);
    if (exists) overwritten.push(name);
    else copied.push(name);
  }

  let schema: AtriumSetupSchemaStatus = "missing";
  if (opts.schemaPath !== undefined && fs.existsSync(opts.schemaPath)) {
    const schemaTarget = path.join(dest, SCHEMA_FILE);
    const exists = fs.existsSync(schemaTarget);
    if (exists && !force) {
      schema = "skipped";
    } else {
      fs.copyFileSync(opts.schemaPath, schemaTarget);
      schema = exists ? "overwritten" : "copied";
    }
  }

  return { destDir: dest, copied, overwritten, skipped, schema };
}

/**
 * Pure helper for testability. `pkgDistDir` is the package's `dist/` directory
 * (where `configs/*.json` and the schema live); `home` is the target HOME.
 * Idempotent: never overwrites existing files.
 */
export function runAtriumPostinstall(opts: {
  pkgDistDir: string;
  home: string;
}): PostinstallResult {
  const setup = runAtriumConfigSetup({
    configsDir: path.join(opts.pkgDistDir, "configs"),
    schemaPath: path.join(opts.pkgDistDir, SCHEMA_FILE),
    home: opts.home,
    force: false,
  });
  return {
    destDir: setup.destDir,
    copied: setup.copied,
    skipped: setup.skipped,
    schemaCopied: setup.schema === "copied",
  };
}

export const POSTINSTALL_SCHEMA_FILE = SCHEMA_FILE;
