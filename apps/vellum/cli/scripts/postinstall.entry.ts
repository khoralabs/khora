import { runVellumPostinstall } from "./postinstall.ts";

/**
 * Entry script for the npm postinstall hook on `@khoralabs/vellum-cli`.
 *
 * Bundled by [scripts/stage-vellum-release.ts](../../../../scripts/stage-vellum-release.ts)
 * via `bun build --target=node` into `release/cli/postinstall.js`, and invoked
 * by npm/pnpm/yarn (the `postinstall` script field) as
 * `node ./postinstall.js` from the installed meta-package root.
 *
 * Bun blocks lifecycle scripts by default — see `bun pm trust` — but the
 * compiled CLI also self-bootstraps on first run via
 * [maybeBootstrapVellumHome](../src/commands/setup.ts), so this script is a
 * nice-to-have, not a hard dependency. Run `vellum setup` to bootstrap manually.
 */
function main(): void {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    console.error("vellum-cli postinstall: HOME / USERPROFILE not set; skipping");
    return;
  }
  try {
    const result = runVellumPostinstall({ home });
    console.log(`vellum-cli: initialized ${result.destDir}`);
  } catch (err) {
    console.error(
      `vellum-cli postinstall failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

main();
