import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAtriumPostinstall } from "./postinstall.ts";

/**
 * Entry script for the npm postinstall hook on `@khoralabs/atrium-cli`.
 *
 * Bundled by [scripts/stage-atrium-release.ts](../../../../scripts/stage-atrium-release.ts)
 * via `bun build --target=node` into `release/cli/postinstall.js`, and invoked
 * by npm/pnpm/yarn (the `postinstall` script field) as
 * `node ./postinstall.js` from the installed meta-package root.
 *
 * Bun blocks lifecycle scripts by default — see `bun pm trust` — but the
 * compiled CLI also self-bootstraps on first run via
 * [maybeBootstrapAtriumHome](../src/commands/setup.ts), so this script is a
 * nice-to-have, not a hard dependency.
 */
function main(): void {
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
    console.error(
      `atrium-cli postinstall failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

main();
