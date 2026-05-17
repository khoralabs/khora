import type { FlagMap } from "@khoralabs/cli-kit";

import type { VellumCliContext } from "../flows/context.ts";
import { handleConnect } from "./connect.ts";
import { handleList } from "./list.ts";
import {
  handleChainCreate,
  handleChainList,
  handleChainSnapshot,
  handleOfferList,
  handleOfferRead,
  handleOfferSendTurn,
  handlePolicyRead,
  handlePolicyValidate,
  handlePortList,
  handlePortRead,
} from "./room-commands.ts";
import { handleRegister } from "./register.ts";
import { handleRoomCreate, handleRoomJoin } from "./room.ts";

export async function dispatch(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const [a, b] = positional;

  if (a === "register") {
    await handleRegister(ctx, flags);
    return;
  }

  if (a === "room" && b === "create") {
    await handleRoomCreate(flags);
    return;
  }

  if (a === "room" && b === "join") {
    await handleRoomJoin(ctx, flags);
    return;
  }

  if (a === "list") {
    handleList(flags);
    return;
  }

  if (a === "connect") {
    await handleConnect(ctx, positional, flags);
    return;
  }

  if (a === "chain" && b === "create") {
    await handleChainCreate(flags);
    return;
  }

  if (a === "chain" && b === "list") {
    handleChainList(flags);
    return;
  }

  if (a === "chain" && b === "snapshot") {
    await handleChainSnapshot(flags);
    return;
  }

  if (a === "offer" && b === "list") {
    handleOfferList(flags);
    return;
  }

  if (a === "offer" && b === "read") {
    handleOfferRead(positional, flags);
    return;
  }

  if (a === "offer" && b === "send-turn") {
    await handleOfferSendTurn(flags);
    return;
  }

  if (a === "port" && b === "list") {
    handlePortList(positional, flags);
    return;
  }

  if (a === "port" && b === "read") {
    handlePortRead(positional, flags);
    return;
  }

  if (a === "policy" && b === "read") {
    handlePolicyRead(positional, flags);
    return;
  }

  if (a === "policy" && b === "validate") {
    handlePolicyValidate(positional, flags);
    return;
  }

  throw new Error(`Unknown command: ${positional.join(" ")}`);
}
