import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

/** CLI entry — runs from `node ./dist/postinstall.js` after `bun build --target=node`. */
export function main(): void {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    console.error("atrium-cli postinstall: HOME / USERPROFILE not set; skipping config write");
    return;
  }
  const pkgDistDir = path.dirname(fileURLToPath(import.meta.url));
  try {
    const result = runAtriumPostinstall({ pkgDistDir, home });
    const summary = result.copied.length > 0 ? `wrote ${result.copied.join(", ")}` : "no new files";
    console.log(`atrium-cli: ${summary} in ${result.destDir}`);
  } catch (err) {
    console.error(`atrium-cli postinstall failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].endsWith("postinstall.js") ||
    process.argv[1].endsWith("postinstall.ts"));
if (invokedAsScript) main();
