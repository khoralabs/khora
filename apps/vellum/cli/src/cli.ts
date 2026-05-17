#!/usr/bin/env bun
import fs from "node:fs";

import { parseNbcTurnBody } from "@khoralabs/obp-v2-nbc";
import { defaultIdentityPath, loadIdentity } from "@khoralabs/agent-persisted-signer";
import { At2Client, type AtriumRoomCreateBody } from "@khoralabs/at2-client";
import { listLocalVellumRows, VellumClient } from "@khoralabs/vellum-client";

function getFlag(
  flags: Record<string, string | boolean>,
  name: string,
  alt?: string,
): string | undefined {
  const k = `--${name}`;
  const raw = flags[k] ?? (alt !== undefined ? flags[`--${alt}`] : undefined);
  if (typeof raw === "string") return raw;
  return undefined;
}

function parseArgv(argv: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(0, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

function readJsonArg(pathOrInline: string): unknown {
  if (pathOrInline.startsWith("@")) {
    const p = pathOrInline.slice(1);
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as unknown;
  }
  return JSON.parse(pathOrInline) as unknown;
}

function cliBaseUrl(flags: Record<string, string | boolean>): string {
  return (
    getFlag(flags, "base-url", "baseUrl") ??
    process.env.VELLUM_BASE_URL ??
    process.env.VELLUM_ATRIUM_BASE_URL ??
    process.env.AT2_BASE_URL ??
    "http://127.0.0.1:8787"
  );
}

function agentIdentityPath(): string {
  return (
    process.env.AT2_AGENT_KEY_PATH?.trim() ??
    process.env.ATRIUM_AGENT_KEY_PATH?.trim() ??
    defaultIdentityPath()
  );
}

function dataDirForEnv(
  flags: Record<string, string | boolean>,
): string | undefined {
  const d =
    getFlag(flags, "data-dir", "dataDir") ??
    process.env.AT2_DATA_DIR ??
    process.env.ATRIUM_DATA_DIR ??
    undefined;
  const t = d?.trim();
  return t !== undefined && t.length > 0 ? t : undefined;
}

function baseCliArgs(flags: Record<string, string | boolean>): VellumClient {
  const roomId =
    getFlag(flags, "room") ?? process.env.VELLUM_ROOM_ID ?? process.env.ATRIUM_ROOM_ID ?? "";
  if (roomId.length === 0) {
    throw new Error("--room <roomId> or env VELLUM_ROOM_ID is required");
  }
  const baseUrl = cliBaseUrl(flags);
  const dataDir = dataDirForEnv(flags);
  return new VellumClient({ baseUrl, roomId, dataDir });
}

function printHelp(): void {
  console.error(`vellum — NBC over AT2 rooms (OBP v2)

Register on the host before rooms or connect (host may require --invite-token).

Usage:
  vellum register --username=<slug> --display-name=<name> [--invite-token=<t>] [--base-url=…] [--data-dir=…]
  vellum room create [--target-did=<did>] [--target-username=<u>] [--ttl-ms=<n>] [--base-url=…] [--data-dir=…]
  vellum room join --join-token=<t> [--base-url=…] [--data-dir=…]
  vellum list [--data-dir=…] [--json]
  vellum connect <roomId>|--room=<id> [--base-url=…] [--ws-url=…]
  vellum [--room=id] chain create --peer-party=<uuid> --peer-key=<hex> [--genesis-json='<JSON>'|@path] [--session][--genesis][--my-party]
  vellum [--room=id] chain list
  vellum [--room=id] chain snapshot
  vellum [--room=id] offer list
  vellum [--room=id] offer read <offerId>
  vellum [--room=id] offer send-turn --session=<id> --json='<JSON>'|--json=@path.json
  vellum [--room=id] port list <offerId>
  vellum [--room=id] port read <portId>
  vellum [--room=id] policy read <portId>
  vellum [--room=id] policy validate <portId> --json='<payload>'`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    printHelp();
    process.exit(1);
    return;
  }

  const { positional, flags } = parseArgv(argv);
  const a = positional[0];

  try {
    if (a === "register") {
      const baseUrl = cliBaseUrl(flags);
      const username = getFlag(flags, "username");
      const displayName = getFlag(flags, "display-name", "displayName");
      if (username === undefined || username.length === 0) {
        throw new Error("register requires --username");
      }
      if (displayName === undefined || displayName.length === 0) {
        throw new Error("register requires --display-name");
      }
      const idPath = agentIdentityPath();
      const signer = await loadIdentity(idPath);
      if (signer === undefined) {
        throw new Error(`identity not found at ${idPath}`);
      }
      const inviteToken = getFlag(flags, "invite-token", "inviteToken");
      const ac = new At2Client({ baseUrl, signer });
      try {
        const out = await ac.register({
          metadata: { username, displayName },
          ...(inviteToken !== undefined && inviteToken.length > 0 ? { inviteToken } : {}),
        });
        console.log(JSON.stringify(out, null, 2));
      } finally {
        ac.dispose();
      }
      return;
    }

    if (a === "room" && positional[1] === "create") {
      const baseUrl = cliBaseUrl(flags);
      const idPath = agentIdentityPath();
      const signer = await loadIdentity(idPath);
      if (signer === undefined) {
        throw new Error(`identity not found at ${idPath}`);
      }
      const targetDid = getFlag(flags, "target-did", "targetDid");
      const targetUsername = getFlag(flags, "target-username", "targetUsername");
      const ttlRaw = getFlag(flags, "ttl-ms", "ttlMs");
      const body: AtriumRoomCreateBody = {};
      if (ttlRaw !== undefined && ttlRaw.length > 0) {
        const n = Number.parseInt(ttlRaw, 10);
        if (!Number.isFinite(n)) throw new Error("--ttl-ms must be a number");
        body.ttlMs = n;
      }
      if (targetDid !== undefined && targetDid.length > 0) body.targetDid = targetDid;
      if (targetUsername !== undefined && targetUsername.length > 0) {
        body.targetUsername = targetUsername;
      }
      const ac = new At2Client({ baseUrl, signer });
      try {
        const out = await ac.createRoom(body);
        console.log(JSON.stringify(out, null, 2));
      } finally {
        ac.dispose();
      }
      return;
    }

    if (a === "room" && positional[1] === "join") {
      const baseUrl = cliBaseUrl(flags);
      const joinToken = getFlag(flags, "join-token", "joinToken");
      if (joinToken === undefined || joinToken.length === 0) {
        throw new Error("room join requires --join-token=<token>");
      }
      const idPath = agentIdentityPath();
      const signer = await loadIdentity(idPath);
      if (signer === undefined) {
        throw new Error(`identity not found at ${idPath}`);
      }
      const ac = new At2Client({ baseUrl, signer });
      try {
        const out = await ac.redeemRoomInvite({ joinToken });
        console.log(JSON.stringify(out, null, 2));
      } finally {
        ac.dispose();
      }
      return;
    }

    if (a === "list") {
      const dataDir = dataDirForEnv(flags);
      const rows = listLocalVellumRows({ dataDir });
      if (flags["--json"] === true) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log("(no rooms under obp/rooms)");
        return;
      }
      console.log("roomId\tpid\tcontrolPort\tstatus");
      for (const r of rows) {
        const pidCol = r.pid !== undefined ? String(r.pid) : "-";
        const portCol = r.controlPort !== undefined ? String(r.controlPort) : "-";
        console.log(`${r.roomId}\t${pidCol}\t${portCol}\t${r.status}`);
      }
      return;
    }

    if (a === "connect") {
      const roomArg = positional[1]?.trim();
      const client = baseCliArgs({
        ...flags,
        ...(roomArg !== undefined && roomArg.length > 0 ? { "--room": roomArg } : {}),
      });
      const ws = getFlag(flags, "ws-url", "wsUrl");
      await client.connect(ws !== undefined && ws.length > 0 ? { webSocketUrl: ws } : undefined);
      console.log(
        "connected — vellum daemon started; control port under room obp directory (vellum.json)",
      );
      return;
    }

    const client = baseCliArgs(flags);

    if (a === "chain" && positional[1] === "create") {
      const peerParty = getFlag(flags, "peer-party", "peerParty");
      const peerKey = getFlag(flags, "peer-key", "peerKey");
      if (peerParty === undefined || peerKey === undefined) {
        throw new Error("chain create requires --peer-party and --peer-key");
      }
      const genesisJson = getFlag(flags, "genesis-json", "genesisJson");
      let genesisTurn: Record<string, unknown> | undefined;
      if (genesisJson !== undefined && genesisJson.length > 0) {
        const parsed = readJsonArg(genesisJson);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("chain create --genesis-json must be a JSON object");
        }
        genesisTurn = parsed as Record<string, unknown>;
      }
      const out = await client.chainCreate({
        peerPartyId: peerParty,
        peerActorPubkeyHex: peerKey,
        sessionId: getFlag(flags, "session"),
        genesisHash: getFlag(flags, "genesis"),
        myPartyId: getFlag(flags, "my-party", "myParty"),
        ...(genesisTurn !== undefined ? { genesisTurn } : {}),
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (a === "chain" && positional[1] === "list") {
      console.log(JSON.stringify(client.listChainsFromStore(), null, 2));
      return;
    }

    if (a === "chain" && positional[1] === "snapshot") {
      console.log(JSON.stringify(await client.getChainSnapshot(), null, 2));
      return;
    }

    if (a === "offer" && positional[1] === "list") {
      console.log(JSON.stringify(client.listOffers(), null, 2));
      return;
    }

    if (a === "offer" && positional[1] === "read") {
      const id = positional[2]?.trim();
      if (id === undefined || id.length === 0)
        throw new Error("usage: vellum offer read <offerId>");
      console.log(JSON.stringify(client.readOffer(id) ?? null, null, 2));
      return;
    }

    if (a === "offer" && positional[1] === "send-turn") {
      const sessionId = getFlag(flags, "session");
      const js = getFlag(flags, "json");
      if (sessionId === undefined || js === undefined) {
        throw new Error("offer send-turn requires --session and --json");
      }
      const nb = parseNbcTurnBody(readJsonArg(js));
      await client.sendTurn(sessionId, JSON.parse(JSON.stringify(nb)) as Record<string, unknown>);
      return;
    }

    if (a === "port" && positional[1] === "list") {
      const offerId = positional[2]?.trim();
      if (offerId === undefined) throw new Error("usage: vellum port list <offerId>");
      console.log(JSON.stringify(client.listPortsForOffer(offerId), null, 2));
      return;
    }

    if (a === "port" && positional[1] === "read") {
      const id = positional[2]?.trim();
      if (id === undefined) throw new Error("usage: vellum port read <portId>");
      console.log(JSON.stringify(client.readPort(id) ?? null, null, 2));
      return;
    }

    if (a === "policy" && positional[1] === "read") {
      const id = positional[2]?.trim();
      if (id === undefined) throw new Error("usage: vellum policy read <portId>");
      console.log(JSON.stringify(client.readPolicySnapshot(id), null, 2));
      return;
    }

    if (a === "policy" && positional[1] === "validate") {
      const id = positional[2]?.trim();
      const js = getFlag(flags, "json");
      if (id === undefined || js === undefined) {
        throw new Error("usage: vellum policy validate <portId> --json=...");
      }
      const payload = readJsonArg(js);
      console.log(JSON.stringify(client.validatePolicy(id, payload), null, 2));
      return;
    }

    console.error(`Unknown command: ${positional.join(" ")}`);
    process.exit(1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

await main();
