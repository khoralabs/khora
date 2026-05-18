import type { FlagMap } from "@khoralabs/cli-kit";

import type { VellumCliContext } from "../flows/context.ts";
import { handleConnect } from "./connect.ts";
import { handleDisconnect } from "./disconnect.ts";
import { handleKeygen } from "./keygen.ts";
import { handleList } from "./list.ts";
import { handleRegister } from "./register.ts";
import { handleRoomCreate, handleRoomJoin, handleRoomLeave, handleRoomRead } from "./room.ts";
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
import { runSetupCommand } from "./setup.ts";
import { handleWhoami } from "./whoami.ts";

export async function dispatch(
  ctx: VellumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const [a, b] = positional;

  if (a === "setup") {
    await runSetupCommand(flags);
    return;
  }

  if (a === "whoami") {
    await handleWhoami(flags);
    return;
  }

  if (a === "keygen") {
    await handleKeygen(flags);
    return;
  }

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

  if (a === "room" && b === "read") {
    await handleRoomRead(positional, flags);
    return;
  }

  if (a === "room" && b === "leave") {
    await handleRoomLeave(ctx, positional, flags);
    return;
  }

  if (a === "room" && b === "connect") {
    await handleConnect(ctx, positional, flags, { roomPositionalIndex: 2 });
    return;
  }

  if (a === "list") {
    await handleList(flags);
    return;
  }

  if (a === "disconnect") {
    handleDisconnect(positional, flags);
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
