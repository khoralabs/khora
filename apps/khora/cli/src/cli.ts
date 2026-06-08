#!/usr/bin/env bun
import { boolFlag, parseArgv, tryPrintCommandHelp } from "@khoralabs/cli-kit";
import { commandHelpTextMap, printHelp } from "./commands/global-help";
import { dispatch } from "./commands/handlers";
import { maybeBootstrapKhoraHome } from "./commands/setup";
import { handleVersion } from "./commands/version";
import { createKhoraCliContext } from "./flows/context";
import { errorMessage } from "./lib/error-message";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp();
    process.exit(1);
    return;
  }

  if (argv[0] === "help") {
    const rest = argv.slice(1);
    if (rest.length === 0) {
      printHelp();
      process.exit(0);
      return;
    }
    if (tryPrintCommandHelp(rest, commandHelpTextMap)) {
      process.exit(0);
      return;
    }
    console.error(`Unknown help topic: ${rest.join(" ")}`);
    process.exit(1);
    return;
  }

  if (argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    process.exit(0);
    return;
  }

  if (argv[0] === "--version" || argv[0] === "-V") {
    handleVersion({});
    process.exit(0);
    return;
  }

  const { positional, flags } = parseArgv(argv);

  if (boolFlag(flags, "version", "V") && positional.length === 0) {
    handleVersion(flags);
    process.exit(0);
    return;
  }

  if (boolFlag(flags, "help", "h")) {
    if (tryPrintCommandHelp(positional, commandHelpTextMap)) {
      process.exit(0);
      return;
    }
    printHelp();
    process.exit(0);
    return;
  }

  maybeBootstrapKhoraHome();

  const ctx = createKhoraCliContext();
  try {
    await dispatch(ctx, positional, flags);
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.startsWith("Unknown command:")) {
      console.error(msg);
      printHelp();
      process.exit(1);
      return;
    }
    console.error(msg);
    process.exit(1);
  } finally {
    ctx.closeReadline();
  }
}

await main();
