import type { FlagMap } from "@khoralabs/cli-kit";

import type { KhoraCliContext } from "../flows/context.ts";
import { handleInboxListen, handleInboxStatus, handleInboxStop } from "./inbox.ts";
import { handleKeygen } from "./keygen.ts";
import {
  handlePostsCreate,
  handlePostsDelete,
  handlePostsGet,
  handlePostsUpdate,
} from "./posts.ts";
import { handleProfileUpdate } from "./profile.ts";
import { handleRegister } from "./register.ts";
import { handleSearch } from "./search.ts";
import { handleSubscriptionsCreate, handleSubscriptionsList } from "./subscriptions.ts";
import { handleWhoami } from "./whoami.ts";

export async function dispatch(
  ctx: KhoraCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const [a, b, c] = positional;

  if (a === "keygen") {
    await handleKeygen(flags);
    return;
  }

  if (a === "register") {
    await handleRegister(ctx, flags);
    return;
  }

  if (a === "whoami") {
    await handleWhoami(flags);
    return;
  }

  if (a === "profile" && b === "update") {
    await handleProfileUpdate(ctx, flags);
    return;
  }

  if (a === "search") {
    await handleSearch(flags);
    return;
  }

  if (a === "inbox" && b === "listen") {
    await handleInboxListen(flags);
    return;
  }

  if (a === "inbox" && b === "stop") {
    handleInboxStop(flags);
    return;
  }

  if (a === "inbox" && b === "status") {
    handleInboxStatus(flags);
    return;
  }

  if (a === "subscriptions" && b === "list") {
    await handleSubscriptionsList(flags);
    return;
  }

  if (a === "subscriptions" && b === "create") {
    await handleSubscriptionsCreate(positional, flags);
    return;
  }

  if (a === "posts" && b === "create") {
    await handlePostsCreate(flags);
    return;
  }

  if (a === "posts" && b === "get") {
    await handlePostsGet(positional, flags);
    return;
  }

  if (a === "posts" && b === "update") {
    await handlePostsUpdate(positional, flags);
    return;
  }

  if (a === "posts" && b === "delete") {
    await handlePostsDelete(positional, flags);
    return;
  }

  void c;
  throw new Error(`Unknown command: ${positional.join(" ")}`);
}
