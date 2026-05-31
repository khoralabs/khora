import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import plugin from "bun-plugin-tailwind";
import type { WebUiConfig } from "./config";

export async function runBuild(config: WebUiConfig, cwd = process.cwd()): Promise<void> {
  const outdir = path.resolve(cwd, config.outdir ?? "dist");
  const entry = path.resolve(cwd, config.serverEntry);

  if (!existsSync(entry)) {
    console.error(`bun-web build: server entry not found: ${entry}`);
    process.exit(1);
  }

  if (existsSync(outdir)) {
    console.log(`bun-web: cleaning ${outdir}`);
    await rm(outdir, { recursive: true, force: true });
  }

  const start = performance.now();
  const bundleDeps = config.bundleDependencies === true;
  const result = await Bun.build({
    entrypoints: [entry],
    outdir,
    target: "bun",
    minify: true,
    sourcemap: "linked",
    plugins: [plugin, ...(config.plugins ?? [])],
    ...(bundleDeps ? {} : { packages: "external" }),
    ...(config.buildEnv !== undefined ? { env: config.buildEnv } : {}),
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });

  if (!result.success) {
    console.error("bun-web build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`bun-web: built ${result.outputs.length} file(s) in ${elapsed}ms → ${outdir}`);
  for (const output of result.outputs) {
    console.log(`  ${path.relative(cwd, output.path)}`);
  }
}
