#!/usr/bin/env bun
import path from "node:path";
import { buildPublishableLib } from "../../../scripts/release/libs/build-publishable-lib.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
await buildPublishableLib({
  packageDir: path.resolve(import.meta.dir, ".."),
  repoRoot,
  externals: [
    "@khoralabs/khora-registry",
    "@khoralabs/memories-node",
    "@khoralabs/memories-service",
    "@khoralabs/sourcemaps",
    "@khoralabs/sqlite-crypto",
    "zod",
  ],
  bundledPackages: [
    { dir: path.join(repoRoot, "packages/colonnade"), name: "@khoralabs/colonnade" },
    { dir: path.join(repoRoot, "packages/percolator"), name: "@khoralabs/percolator" },
    { dir: path.join(repoRoot, "packages/contracts"), name: "@khoralabs/khora-contracts" },
    { dir: path.join(repoRoot, "packages/auth"), name: "@khoralabs/khora-auth" },
    {
      dir: path.join(repoRoot, "vendor/libs/packages/observability"),
      name: "@khoralabs/observability",
    },
  ],
});
