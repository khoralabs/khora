#!/usr/bin/env bun
import path from "node:path";
import { buildPublishableLib } from "../../../scripts/release/libs/build-publishable-lib.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
await buildPublishableLib({
  packageDir: path.resolve(import.meta.dir, ".."),
  repoRoot,
  externals: ["@khoralabs/sqlite-crypto", "@opentelemetry/api", "@tursodatabase/serverless"],
  bundledPackages: [
    { dir: path.join(repoRoot, "packages/colonnade"), name: "@khoralabs/colonnade" },
    { dir: path.join(repoRoot, "packages/auth"), name: "@khoralabs/khora-auth" },
    {
      dir: path.join(repoRoot, "vendor/libs/packages/observability"),
      name: "@khoralabs/observability",
    },
  ],
});
