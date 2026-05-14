import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createAgentRelayPersistenceClient, createFrameChannelHub } from "@khoralabs/agent-relay";
import { createAgentRelaySqlitePersistence } from "../persistence/sqlite/agent-relay-sqlite.ts";
import { createHostRateLimiters } from "../rate-limit-buckets.ts";
import {
  handleAtriumRoomMintTicket,
  handleAtriumRoomsCreate,
  handleAtriumRoomsList,
  parseAtriumRoomTicketPath,
} from "./atrium-rooms.ts";
import type { HostRouteDeps } from "./deps.ts";

function depsFor(
  db: Database,
  did: string,
  persistence: ReturnType<typeof createAgentRelaySqlitePersistence>,
): HostRouteDeps {
  const persistenceClient = createAgentRelayPersistenceClient(persistence);
  const roomHub = createFrameChannelHub({
    hubPersistence: persistence.frameChannelHubPersistence,
  });
  return {
    ctx: {
      db,
      auth: {
        requireAuthenticatedRequest: async () => ({ did }),
      },
      host: { persistenceClient },
      roomHub,
      usernamesRepo: {
        lookupByUsername: () => undefined,
        lookupByDid: (d: string) => (d === "did:key:bob" ? { username: "bob" } : undefined),
      },
    },
    invitesRepo: undefined,
    rateLimiters: createHostRateLimiters(),
    loadPublicProfileForDid: () => null,
  } as unknown as HostRouteDeps;
}

describe("atrium-rooms HTTP", () => {
  test("parseAtriumRoomTicketPath", () => {
    expect(parseAtriumRoomTicketPath("/v1/atrium/rooms/r%20a/ticket")).toBe("r%20a");
    expect(parseAtriumRoomTicketPath("/v1/atrium/rooms/foo/ws")).toBeUndefined();
  });

  test("handleAtriumRoomsList maps creator and peer", async () => {
    const db = new Database(":memory:");
    const persistence = createAgentRelaySqlitePersistence(db);
    persistence.agentRegistrations.upsert("did:key:alice", "prof-a");
    persistence.agentRegistrations.upsert("did:key:bob", "prof-b");
    await createFrameChannelHub({
      hubPersistence: persistence.frameChannelHubPersistence,
    }).createChannel("room-1", 86_400_000);
    db.run(
      `INSERT INTO atrium_rooms (room_id, created_by_profile_id, created_at_ms, invite_target_did, expires_at_ms)
       VALUES ('room-1', 'prof-a', 1000, 'did:key:bob', 2000)`,
    );

    const aliceRes = await handleAtriumRoomsList(
      new Request("http://h/v1/atrium/rooms"),
      new URL("http://h/v1/atrium/rooms"),
      depsFor(db, "did:key:alice", persistence),
    );
    expect(aliceRes.status).toBe(200);
    const aliceJson = (await aliceRes.json()) as {
      rooms: { role: string; counterpartDid: string | null }[];
    };
    expect(aliceJson.rooms).toHaveLength(1);
    expect(aliceJson.rooms[0]?.role).toBe("creator");
    expect(aliceJson.rooms[0]?.counterpartDid).toBe("did:key:bob");

    const bobRes = await handleAtriumRoomsList(
      new Request("http://h/v1/atrium/rooms"),
      new URL("http://h/v1/atrium/rooms"),
      depsFor(db, "did:key:bob", persistence),
    );
    const bobJson = (await bobRes.json()) as {
      rooms: { role: string; counterpartDid: string | null }[];
    };
    expect(bobJson.rooms[0]?.role).toBe("peer");
    expect(bobJson.rooms[0]?.counterpartDid).toBe("did:key:alice");
  });

  test("handleAtriumRoomMintTicket forbids non-member", async () => {
    const db = new Database(":memory:");
    const persistence = createAgentRelaySqlitePersistence(db);
    persistence.agentRegistrations.upsert("did:key:alice", "prof-a");
    persistence.agentRegistrations.upsert("did:key:bob", "prof-b");
    persistence.agentRegistrations.upsert("did:key:carol", "prof-c");
    const hub = createFrameChannelHub({ hubPersistence: persistence.frameChannelHubPersistence });
    await hub.createChannel("room-x", 86_400_000);
    db.run(
      `INSERT INTO atrium_rooms (room_id, created_by_profile_id, created_at_ms, invite_target_did, expires_at_ms)
       VALUES ('room-x', 'prof-a', 1, 'did:key:bob', 9999999999999)`,
    );
    const res = await handleAtriumRoomMintTicket(
      new Request("http://h/v1/atrium/rooms/room-x/ticket", { method: "POST", body: "{}" }),
      new URL("http://h/v1/atrium/rooms/room-x/ticket"),
      depsFor(db, "did:key:carol", persistence),
      "room-x",
    );
    expect(res.status).toBe(403);
  });

  test("handleAtriumRoomMintTicket succeeds for invitee", async () => {
    const db = new Database(":memory:");
    const persistence = createAgentRelaySqlitePersistence(db);
    persistence.agentRegistrations.upsert("did:key:alice", "prof-a");
    persistence.agentRegistrations.upsert("did:key:bob", "prof-b");
    const hub = createFrameChannelHub({ hubPersistence: persistence.frameChannelHubPersistence });
    await hub.createChannel("room-y", 86_400_000);
    db.run(
      `INSERT INTO atrium_rooms (room_id, created_by_profile_id, created_at_ms, invite_target_did, expires_at_ms)
       VALUES ('room-y', 'prof-a', 1, 'did:key:bob', 9999999999999)`,
    );
    const res = await handleAtriumRoomMintTicket(
      new Request("http://h/v1/atrium/rooms/room-y/ticket", { method: "POST", body: "{}" }),
      new URL("http://h/v1/atrium/rooms/room-y/ticket"),
      depsFor(db, "did:key:bob", persistence),
      "room-y",
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ticket: string; webSocketUrl: string };
    expect(j.ticket.length).toBeGreaterThan(4);
    expect(j.webSocketUrl).toContain("ticket=");
  });

  test("handleAtriumRoomsCreate rejects self-invite", async () => {
    const db = new Database(":memory:");
    const persistence = createAgentRelaySqlitePersistence(db);
    persistence.agentRegistrations.upsert("did:key:alice", "prof-a");
    const deps = depsFor(db, "did:key:alice", persistence);
    (
      deps.ctx as unknown as {
        host: {
          persistenceClient: unknown;
          offerFrameChannelToPrincipal: (p: {
            targetPrincipalId: string;
            channelId: string;
            ticket: string;
            expiresAtMs?: number;
            fromPrincipalId?: string;
          }) => Promise<void>;
        };
      }
    ).host = {
      persistenceClient: createAgentRelayPersistenceClient(persistence),
      offerFrameChannelToPrincipal: async () => {},
    };
    const res = await handleAtriumRoomsCreate(
      new Request("http://h/v1/atrium/rooms", {
        method: "POST",
        body: JSON.stringify({ targetDid: "did:key:alice" }),
      }),
      new URL("http://h/v1/atrium/rooms"),
      deps,
    );
    expect(res.status).toBe(400);
  });

  test("handleAtriumRoomsCreate rejects client roomId in body", async () => {
    const db = new Database(":memory:");
    const persistence = createAgentRelaySqlitePersistence(db);
    persistence.agentRegistrations.upsert("did:key:alice", "prof-a");
    const deps = depsFor(db, "did:key:alice", persistence);
    (
      deps.ctx as unknown as {
        host: {
          persistenceClient: unknown;
          offerFrameChannelToPrincipal: (p: {
            targetPrincipalId: string;
            channelId: string;
            ticket: string;
            expiresAtMs?: number;
            fromPrincipalId?: string;
          }) => Promise<void>;
        };
      }
    ).host = {
      persistenceClient: createAgentRelayPersistenceClient(persistence),
      offerFrameChannelToPrincipal: async () => {},
    };
    const res = await handleAtriumRoomsCreate(
      new Request("http://h/v1/atrium/rooms", {
        method: "POST",
        body: JSON.stringify({ roomId: "client-chosen" }),
      }),
      new URL("http://h/v1/atrium/rooms"),
      deps,
    );
    expect(res.status).toBe(400);
  });
});
