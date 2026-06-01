import type { FlagMap } from "@khoralabs/cli-kit";

import type { KhoraCliContext } from "../flows/context";
import { handleHostList, handleHostRegister, handleHostShow, handleHostUse } from "./host";
import { handleInboxListen, handleInboxStatus, handleInboxStop } from "./inbox";
import { handleKeygen } from "./keygen";
import { handleLink, handleLinkStatus, handleLinkUnlink } from "./link";
import { handlePostsCreate, handlePostsDelete, handlePostsGet, handlePostsUpdate } from "./posts";
import { handleProfileUpdate } from "./profile";
import { handleRegister } from "./register";
import { handleSearch } from "./search";
import { handleSubscriptionsCreate, handleSubscriptionsList } from "./subscriptions";
import { handleUnregister } from "./unregister";
import { handleWhoami } from "./whoami";

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

  if (a === "host" && b === "list") {
    await handleHostList(flags);
    return;
  }

  if (a === "host" && b === "use") {
    await handleHostUse(flags, c);
    return;
  }

  if (a === "host" && b === "show") {
    handleHostShow(flags);
    return;
  }

  if (a === "host" && b === "register") {
    await handleHostRegister(flags);
    return;
  }

  if (a === "link" && b === undefined) {
    await handleLink(flags);
    return;
  }

  if (a === "link" && b === "status") {
    await handleLinkStatus(flags);
    return;
  }

  if (a === "link" && b === "unlink") {
    await handleLinkUnlink(flags);
    return;
  }

  if (a === "register") {
    await handleRegister(ctx, flags);
    return;
  }

  if (a === "unregister") {
    await handleUnregister(flags);
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
    await handleSubscriptionsCreate(ctx, positional, flags);
    return;
  }

  if (a === "posts" && b === "create") {
    await handlePostsCreate(ctx, flags);
    return;
  }

  if (a === "posts" && b === "get") {
    await handlePostsGet(positional, flags);
    return;
  }

  if (a === "posts" && b === "update") {
    await handlePostsUpdate(ctx, positional, flags);
    return;
  }

  if (a === "posts" && b === "delete") {
    await handlePostsDelete(positional, flags);
    return;
  }

  void c;
  throw new Error(`Unknown command: ${positional.join(" ")}`);
}
