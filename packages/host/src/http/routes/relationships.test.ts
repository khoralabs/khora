import { describe, expect, test } from "bun:test";
import type { KhoraHostContext } from "../..";
import type { HostNotification } from "../../inbox/notification-buffer";
import { createInMemoryKhoraHostPersistence } from "../../persistence/core/in-memory";
import type { HostRouteDeps } from "./deps";
import {
  handleAcceptRelationship,
  handleCreateRelationship,
  handleDeclineRelationship,
  handleDeleteRelationship,
  handleListRelationships,
  handleRevokeRelationship,
} from "./relationships";

function rateLimitersAlwaysOk(): HostRouteDeps["rateLimiters"] {
  const rateOk = { ok: true as const, retryAfterSec: 0 };
  const allow: HostRouteDeps["rateLimiters"]["registerIp"] = () => rateOk;
  return {
    registerIp: allow,
    registerDid: allow,
    postsDid: allow,
    topicsDid: allow,
    profileDid: allow,
    inboxDid: allow,
    inboxBindDid: allow,
    inboxUnboundIp: allow,
    defaultIp: allow,
    invitePreviewIp: allow,
    invitesListDid: allow,
  };
}

function createDeps(opts: { actorDid: string; registered: Set<string> }): {
  deps: HostRouteDeps;
  notifications: Map<string, HostNotification[]>;
} {
  const persistence = createInMemoryKhoraHostPersistence();
  const notifications = new Map<string, HostNotification[]>();
  let nextId = 1;
  const notificationBuffer = {
    async ensureRegistered() {},
    async enqueue(principalId: string, note: HostNotification) {
      const list = notifications.get(principalId) ?? [];
      list.push(note);
      notifications.set(principalId, list);
      return nextId++;
    },
    async dequeueBatch() {
      return [];
    },
  };
  const inboxHub = {
    broadcast() {},
    listenerCount() {
      return 0;
    },
  };

  const deps: HostRouteDeps = {
    ctx: {
      social: persistence.social,
      auth: {
        requireAuthenticatedRequest: async () => ({ did: opts.actorDid }),
      },
      host: {
        persistenceClient: {
          registrationExists: (did: string) => opts.registered.has(did),
        },
        notificationBuffer,
        inboxHub,
      },
    } as unknown as KhoraHostContext,
    rateLimiters: rateLimitersAlwaysOk(),
    adminTokenAuth: null,
  };
  return { deps, notifications };
}

function withActor(deps: HostRouteDeps, did: string): HostRouteDeps {
  return {
    ...deps,
    ctx: {
      ...deps.ctx,
      auth: {
        requireAuthenticatedRequest: async () => ({ did }),
      },
    } as unknown as KhoraHostContext,
  };
}

describe("relationship routes", () => {
  const alice = "did:key:alice";
  const bob = "did:key:bob";

  test("create → accept → list → delete", async () => {
    const { deps, notifications } = createDeps({
      actorDid: alice,
      registered: new Set([alice, bob]),
    });
    const createRes = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerDid: bob }),
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      relationship: { channelId: string; status: string; peerDid: string };
    };
    expect(created.relationship.status).toBe("pending");
    expect(created.relationship.peerDid).toBe(bob);
    expect(notifications.get(bob)?.[0]?.kind).toBe("connection_request");

    const acceptRes = await handleAcceptRelationship(
      new Request("http://x/v1/relationships/x/accept", { method: "POST" }),
      new URL("http://x/v1/relationships/x/accept"),
      withActor(deps, bob),
      created.relationship.channelId,
    );
    expect(acceptRes.status).toBe(200);
    const accepted = (await acceptRes.json()) as {
      relationship: { status: string };
    };
    expect(accepted.relationship.status).toBe("accepted");

    const listAlice = await handleListRelationships(
      new Request("http://x/v1/relationships"),
      new URL("http://x/v1/relationships"),
      withActor(deps, alice),
    );
    const aliceBody = (await listAlice.json()) as {
      relationships: { status: string }[];
    };
    expect(aliceBody.relationships).toHaveLength(1);
    expect(aliceBody.relationships[0]?.status).toBe("accepted");

    const del = await handleDeleteRelationship(
      new Request("http://x/v1/relationships/x", { method: "DELETE" }),
      new URL("http://x/v1/relationships/x"),
      withActor(deps, alice),
      created.relationship.channelId,
    );
    expect(del.status).toBe(204);
  });

  test("decline removes pending invite", async () => {
    const { deps } = createDeps({
      actorDid: alice,
      registered: new Set([alice, bob]),
    });
    const createRes = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerDid: bob }),
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    const { relationship } = (await createRes.json()) as {
      relationship: { channelId: string };
    };
    const decline = await handleDeclineRelationship(
      new Request("http://x/decline", { method: "POST" }),
      new URL("http://x/decline"),
      withActor(deps, bob),
      relationship.channelId,
    );
    expect(decline.status).toBe(204);
    const list = await handleListRelationships(
      new Request("http://x/v1/relationships"),
      new URL("http://x/v1/relationships"),
      withActor(deps, bob),
    );
    expect(((await list.json()) as { relationships: unknown[] }).relationships).toHaveLength(0);
  });

  test("revoke removes invite but leaves inbox notification", async () => {
    const { deps, notifications } = createDeps({
      actorDid: alice,
      registered: new Set([alice, bob]),
    });
    const createRes = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerDid: bob }),
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    const { relationship } = (await createRes.json()) as {
      relationship: { channelId: string };
    };
    expect(notifications.get(bob)).toHaveLength(1);

    const revoke = await handleRevokeRelationship(
      new Request("http://x/revoke", { method: "POST" }),
      new URL("http://x/revoke"),
      withActor(deps, alice),
      relationship.channelId,
    );
    expect(revoke.status).toBe(204);
    expect(notifications.get(bob)).toHaveLength(1);

    const accept = await handleAcceptRelationship(
      new Request("http://x/accept", { method: "POST" }),
      new URL("http://x/accept"),
      withActor(deps, bob),
      relationship.channelId,
    );
    expect(accept.status).toBe(404);
  });

  test("rejects self-invite and unknown peer", async () => {
    const { deps } = createDeps({
      actorDid: alice,
      registered: new Set([alice]),
    });
    const selfInvite = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerDid: alice }),
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    expect(selfInvite.status).toBe(400);

    const missing = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerDid: bob }),
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    expect(missing.status).toBe(404);
  });

  test("duplicate invite conflicts", async () => {
    const { deps } = createDeps({
      actorDid: alice,
      registered: new Set([alice, bob]),
    });
    const body = JSON.stringify({ peerDid: bob });
    const first = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    expect(first.status).toBe(201);
    const second = await handleCreateRelationship(
      new Request("http://x/v1/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerDid: bob }),
      }),
      new URL("http://x/v1/relationships"),
      deps,
    );
    expect(second.status).toBe(409);
  });
});
