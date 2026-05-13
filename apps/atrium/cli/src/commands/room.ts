import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AtriumRoomCreateBody } from "@khoralabs/atrium-contracts";
import { readRoomDaemonStatus, roomDaemonLogPath } from "@khoralabs/atrium-daemon";
import { cliAppConfig } from "../app-config.ts";
import type { AtriumCliContext } from "../flows/context.ts";
import { boolFlag, strFlag } from "./parse.ts";
import { buildDaemonPassthroughArgs, resolveDaemonInvocation } from "./start.ts";
import type { FlagMap } from "./types.ts";

function wsOriginFromHttpBase(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.origin;
}

export async function runRoomCreateCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const targetUsername = strFlag(flags, "target-username") ?? strFlag(flags, "targetUsername");
  const targetDid = strFlag(flags, "target-did") ?? strFlag(flags, "targetDid");
  const ttlRaw = strFlag(flags, "ttl-ms") ?? strFlag(flags, "ttlMs");
  const ttlMs =
    ttlRaw !== undefined && ttlRaw.length > 0 ? Number.parseInt(ttlRaw, 10) : undefined;
  if (ttlMs !== undefined && (Number.isNaN(ttlMs) || ttlMs < 60_000)) {
    throw new Error("atrium room create: --ttl-ms must be an integer >= 60000");
  }
  const body: AtriumRoomCreateBody = {};
  if (targetUsername !== undefined && targetUsername.length > 0) {
    body.targetUsername = targetUsername;
  }
  if (targetDid !== undefined && targetDid.length > 0) {
    body.targetDid = targetDid;
  }
  if (ttlMs !== undefined) {
    body.ttlMs = ttlMs;
  }
  const out = await ctx.client.createAtriumRoom(body);
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`roomId\t${out.roomId}`);
  console.log(`webSocketUrl\t${out.webSocketUrl}`);
}

export async function runRoomListCommand(ctx: AtriumCliContext, flags: FlagMap): Promise<void> {
  const out = await ctx.client.listAtriumRooms();
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  for (const r of out.rooms) {
    const parts = [
      r.roomId,
      r.role,
      r.counterpartDid ?? "-",
      r.counterpartUsername ?? "",
      String(r.createdAtMs),
    ];
    console.log(parts.join("\t"));
  }
  if (out.rooms.length === 0) {
    console.log("(no rooms)");
  }
}

const ROOM_ACK_TIMEOUT_MS = 1500;
const ROOM_ACK_POLL_MS = 50;

async function waitForRoomDaemonRunning(roomId: string): Promise<ReturnType<typeof readRoomDaemonStatus>> {
  const deadline = Date.now() + ROOM_ACK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const s = readRoomDaemonStatus(cliAppConfig, roomId);
    if (s.state === "running") return s;
    await Bun.sleep(ROOM_ACK_POLL_MS);
  }
  return readRoomDaemonStatus(cliAppConfig, roomId);
}

export async function runRoomJoinCommand(
  ctx: AtriumCliContext,
  positional: string[],
  flags: FlagMap,
): Promise<void> {
  const roomId = positional[2]?.trim();
  if (roomId === undefined || roomId.length === 0) {
    throw new Error("usage: atrium room join <roomId> [<ticket>]");
  }
  const ticket = positional[3]?.trim();
  const origin = wsOriginFromHttpBase(ctx.baseUrl);
  const background = boolFlag(flags, "background", "b");

  let webSocketUrl: string;
  if (ticket === undefined || ticket.length === 0) {
    const out = await ctx.client.mintAtriumRoomTicket(roomId);
    webSocketUrl = out.webSocketUrl;
  } else {
    webSocketUrl = `${origin}/v1/atrium/rooms/${encodeURIComponent(roomId)}/ws?ticket=${encodeURIComponent(ticket)}`;
  }

  const preflight = readRoomDaemonStatus(cliAppConfig, roomId);
  if (preflight.state === "running") {
    console.error(
      `room handler already running for this room (pid ${preflight.pid}) — try 'atrium status' or 'atrium kill --pid ${preflight.pid}'`,
    );
    process.exit(1);
  }

  const passthrough = buildDaemonPassthroughArgs(flags);
  const cmd = [...resolveDaemonInvocation(), ...passthrough];
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ATRIUM_DAEMON_KIND: "room",
    ATRIUM_ROOM_ID: roomId,
    ATRIUM_ROOM_WS_URL: webSocketUrl,
  };

  type BunSpawnOptions = Parameters<typeof Bun.spawn>[1] & { detached?: boolean };

  if (!background) {
    const proc = Bun.spawn(cmd, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      env: childEnv,
    });
    const forward = (sig: NodeJS.Signals) => proc.kill(sig);
    process.on("SIGINT", () => forward("SIGINT"));
    process.on("SIGTERM", () => forward("SIGTERM"));
    process.exit(await proc.exited);
  }

  const logPath = roomDaemonLogPath(cliAppConfig, roomId);
  await mkdir(path.dirname(logPath), { recursive: true });
  const fd = openSync(logPath, "a", 0o644);
  const proc = Bun.spawn(cmd, {
    stdin: "ignore",
    stdout: fd,
    stderr: fd,
    env: childEnv,
    detached: true,
  } satisfies BunSpawnOptions as BunSpawnOptions);
  (proc as { unref?: () => void }).unref?.();

  const status = await waitForRoomDaemonRunning(roomId);
  if (status.state !== "running") {
    console.error(`room daemon failed to start; check log: ${logPath}`);
    process.exit(1);
  }
  if (boolFlag(flags, "json")) {
    console.log(JSON.stringify({ kind: "room", pid: status.pid, log: logPath, roomId }, null, 2));
    process.exit(0);
  }
  console.log(`room daemon started pid=${status.pid} log=${logPath}`);
  process.exit(0);
}
