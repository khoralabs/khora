#!/usr/bin/env bun
import { runBuild } from "./build";
import { runCheck } from "./check";
import { loadWebUiConfig } from "./load-config";

const command = process.argv[2] ?? "build";

if (command === "--help" || command === "-h" || command === "help") {
  console.log(`Usage: bun-web <command>

Commands:
  build   bun build --target=bun --production on serverEntry (web-ui.config.ts)
  check   scan dist/**/*.js for forbidden patterns from config

Options:
  --config=web-ui.config.ts`);
  process.exit(0);
}

const config = await loadWebUiConfig();

if (command === "build") {
  await runBuild(config);
  await runCheck(config);
} else if (command === "check") {
  await runCheck(config);
} else {
  console.error(`bun-web: unknown command "${command}"`);
  process.exit(1);
}
