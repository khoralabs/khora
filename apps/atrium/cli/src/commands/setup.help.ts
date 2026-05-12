import type { CommandHelp } from "./types.ts";

export const setupHelp: CommandHelp = {
  command: "setup",
  summary:
    "Drop the canonical Atrium config set (base/cli/daemon.config.json + JSON schema) into ~/.atrium/. Idempotent.",
  args: `atrium setup [--force | -f] [--json]
  Copies the three canonical config files plus atrium-config.schema.json into
  ~/.atrium/ (creating the directory if needed). Files that already exist are
  left untouched and reported as 'skipped' on stdout.

  --force, -f    Overwrite existing files instead of skipping.
  --json         Emit a JSON summary: { destDir, copied, overwritten, skipped, schema }.
                 'schema' is one of copied | overwritten | skipped | missing.

This is the same drop that runs on 'npm i -g @khoralabs/atrium-cli' as a
postinstall step; use 'atrium setup' to re-run it for installs with
--ignore-scripts, monorepo dev clones, or after manually removing files.`,
};
