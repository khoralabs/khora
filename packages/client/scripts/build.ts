#!/usr/bin/env bun
import path from "node:path";
import { buildPublishableLib } from "../../../scripts/release/libs/build-publishable-lib.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
await buildPublishableLib({
  packageDir: path.resolve(import.meta.dir, ".."),
  repoRoot,
  externals: ["@khoralabs/did-key-identity", "zod"],
  bundledPackages: [
    { dir: path.join(repoRoot, "packages/contracts"), name: "@khoralabs/khora-contracts" },
    { dir: path.join(repoRoot, "packages/auth"), name: "@khoralabs/khora-auth" },
  ],
});
