import path, { join } from "node:path";
import { Glob } from "bun";
import type { WebUiConfig } from "./config";

export async function runCheck(config: WebUiConfig, cwd = process.cwd()): Promise<void> {
  const patterns = config.check?.forbid ?? [];
  if (patterns.length === 0) {
    console.log("bun-web check: no forbid patterns configured");
    return;
  }

  const outdir = path.resolve(cwd, config.outdir ?? "dist");
  const files = [...new Glob("**/*.js").scanSync(outdir)];
  if (files.length === 0) {
    console.error(`bun-web check: no JS files under ${outdir}`);
    process.exit(1);
  }

  for (const rel of files) {
    const filePath = join(outdir, rel);
    const text = await Bun.file(filePath).text();
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        console.error(`bun-web check: ${rel} matches ${pattern}`);
        process.exit(1);
      }
    }
  }

  console.log(`bun-web check: ok (${files.length} file(s))`);
}
