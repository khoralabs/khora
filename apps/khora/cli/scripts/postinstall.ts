import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Pure library for the canonical-config drop into `~/.khora/`.
 * Bundled into the npm postinstall script; no top-level side effects.
 */

const CONFIG_FILES = ["base.config.json", "cli.config.json", "daemon.config.json"] as const;
const SCHEMA_FILE = "khora-config.schema.json";

export type KhoraSetupSchemaStatus = "copied" | "overwritten" | "skipped" | "missing";

export type KhoraSetupResult = {
  destDir: string;
  copied: string[];
  overwritten: string[];
  skipped: string[];
  schema: KhoraSetupSchemaStatus;
};

export type PostinstallResult = {
  destDir: string;
  copied: string[];
  skipped: string[];
  schemaCopied: boolean;
};

export function runKhoraConfigSetup(opts: {
  configsDir: string;
  schemaPath: string | undefined;
  home: string;
  force?: boolean;
}): KhoraSetupResult {
  const force = opts.force ?? false;
  const dest = path.join(opts.home, ".khora");
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
    body = body.replaceAll("~/.khora", dest);
    fs.writeFileSync(target, body);
    if (exists) overwritten.push(name);
    else copied.push(name);
  }

  let schema: KhoraSetupSchemaStatus = "missing";
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

export function runKhoraPostinstall(opts: { pkgDistDir: string; home: string }): PostinstallResult {
  const setup = runKhoraConfigSetup({
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
