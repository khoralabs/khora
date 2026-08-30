#!/usr/bin/env bun
/** App-local preinstall entry: installs Litestream into this package's `.bin/`. */
import path from "node:path";

const shared = path.resolve(import.meta.dir, "../../../scripts/litestream/install.ts");
const result = Bun.spawnSync(["bun", shared, "--output", ".bin/litestream"], {
  cwd: path.resolve(import.meta.dir, ".."),
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(result.exitCode ?? 1);
