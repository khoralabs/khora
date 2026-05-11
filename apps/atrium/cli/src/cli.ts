#!/usr/bin/env bun
import { AtriumClientError } from "@cfd/atrium-client";
import {
  type AtriumCliCommandHandlers,
  defaultAtriumCliCommandHandlers,
} from "./commands/handlers.ts";
import { printHelp } from "./commands/help.ts";
import { parseArgv } from "./commands/parse.ts";
import { type AtriumCliContext, createAtriumCliContext } from "./flows/context.ts";

export { type AtriumCliCommandHandlers, defaultAtriumCliCommandHandlers };

async function main(
  handlers: AtriumCliCommandHandlers = defaultAtriumCliCommandHandlers,
): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    printHelp();
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const { positional, flags } = parseArgv(argv);
  const [a, b, c] = positional;

  if (a === "key") {
    try {
      await handlers.key(b, flags);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
    return;
  }

  let ctx: AtriumCliContext;
  try {
    ctx = await createAtriumCliContext();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const client = ctx.client;

  try {
    if (a === "health") {
      await handlers.health(ctx);
      return;
    }

    if (a === "register") {
      await handlers.register(ctx, flags);
      return;
    }

    if (a === "profile" && b === "update") {
      await handlers.profileUpdate(ctx, flags);
      return;
    }

    if (a === "inbox" && b === "list") {
      await handlers.inboxList(ctx, flags);
      return;
    }

    if (a === "post" && b === "create") {
      await handlers.postCreate(ctx, flags);
      return;
    }

    if (a === "post" && b === "update") {
      await handlers.postUpdate(ctx, c ?? "", flags);
      return;
    }

    if (a === "post" && b === "delete") {
      await handlers.postDelete(ctx, c ?? "", flags);
      return;
    }

    if (a === "topic" && b === "subscribe") {
      await handlers.topicSubscribe(ctx, c, flags);
      return;
    }

    if (a === "topic" && b === "unsubscribe") {
      await handlers.topicUnsubscribe(ctx, c, flags);
      return;
    }

    console.error(`Unknown command: ${positional.join(" ")}`);
    printHelp();
    process.exit(1);
  } catch (e) {
    if (e instanceof AtriumClientError) {
      console.error(e.message);
      process.exit(1);
    }
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  } finally {
    ctx.closeReadline();
    client.dispose();
  }
}

await main();
