import path from "node:path";
import { fileURLToPath } from "node:url";
import { runKhoraPostinstall } from "./postinstall.ts";

/**
 * Entry script for the npm postinstall hook on `@khoralabs/khora-cli`.
 * Bundled by scripts/stage-khora-release.ts into release/cli/postinstall.js.
 */
function main(): void {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    console.error("khora-cli postinstall: HOME / USERPROFILE not set; skipping");
    return;
  }
  const pkgDistDir = path.dirname(fileURLToPath(import.meta.url));
  try {
    const result = runKhoraPostinstall({ pkgDistDir, home });
    const summary =
      result.copied.length > 0 ? `wrote ${result.copied.join(", ")}` : "no new config files";
    console.log(`khora-cli: ${summary} in ${result.destDir}`);
  } catch (err) {
    console.error(
      `khora-cli postinstall failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

main();
