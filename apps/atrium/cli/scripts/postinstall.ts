import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_FILES = ["base.config.json", "cli.config.json", "daemon.config.json"] as const;
const SCHEMA_FILE = "atrium-config.schema.json";

export type PostinstallResult = {
  destDir: string;
  copied: string[];
  skipped: string[];
  schemaCopied: boolean;
};

/**
 * Pure helper for testability. `pkgDistDir` is the package's `dist/` directory
 * (where `configs/*.json` and the schema live); `home` is the target HOME.
 * Idempotent: never overwrites existing files.
 */
export function runAtriumPostinstall(opts: { pkgDistDir: string; home: string }): PostinstallResult {
  const dest = path.join(opts.home, ".atrium");
  fs.mkdirSync(dest, { recursive: true });

  const copied: string[] = [];
  const skipped: string[] = [];
  for (const name of CONFIG_FILES) {
    const target = path.join(dest, name);
    if (fs.existsSync(target)) {
      skipped.push(name);
      continue;
    }
    const src = path.join(opts.pkgDistDir, "configs", name);
    let body = fs.readFileSync(src, "utf8");
    body = body.replaceAll("~/.atrium", dest);
    fs.writeFileSync(target, body);
    copied.push(name);
  }

  let schemaCopied = false;
  const schemaTarget = path.join(dest, SCHEMA_FILE);
  if (!fs.existsSync(schemaTarget)) {
    fs.copyFileSync(path.join(opts.pkgDistDir, SCHEMA_FILE), schemaTarget);
    schemaCopied = true;
  }

  return { destDir: dest, copied, skipped, schemaCopied };
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
