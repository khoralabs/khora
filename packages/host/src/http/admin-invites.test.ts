import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRootTokenAdminAuth } from "@khoralabs/khora-auth";
import type { KhoraHostContext } from "..";
import { createKhoraInvitesSqliteRepo } from "../persistence/sqlite";
import type { HostRouteDeps } from "./routes/deps";
import { handleInviteTree } from "./routes/invites";
import { handleAdminInvitesMint, handleAdminInviteTree } from "./routes/ops-invites";

const ROOT_TOKEN = "test-root-token-16chars";
const INVITE_PEPPER = "test-invite-pepper-32chars-xxxx";

describe("ops invites mint", () => {
  let db: Database;
  const adminTokenAuth = createRootTokenAdminAuth({ rootToken: ROOT_TOKEN });

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  function routeDeps(withInvites: boolean): HostRouteDeps {
    return {
      ctx: {
        invitesRepo: withInvites ? createKhoraInvitesSqliteRepo(db, INVITE_PEPPER) : undefined,
        host: {
          persistenceClient: {
            registrationExists: () => false,
          },
        },
      } as unknown as KhoraHostContext,
      rateLimiters: {} as HostRouteDeps["rateLimiters"],
      adminTokenAuth,
    };
  }

  test("POST /v1/ops/invites/mint with Bearer returns tokens", async () => {
    const res = await handleAdminInvitesMint(
      new Request("http://x/v1/ops/invites/mint", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ROOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ count: 1 }),
      }),
      routeDeps(true),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tokens: string[] };
    expect(body.ok).toBe(true);
    expect(body.tokens).toHaveLength(1);
    expect(typeof body.tokens[0]).toBe("string");
    expect(body.tokens[0]?.length).toBeGreaterThan(0);
  });

  test("POST /v1/ops/invites/mint rejects missing auth", async () => {
    const res = await handleAdminInvitesMint(
      new Request("http://x/v1/ops/invites/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      }),
      routeDeps(true),
    );
    expect(res.status).toBe(401);
  });

  test("GET /v1/ops/invites/tree requires bearer", async () => {
    const res = await handleAdminInviteTree(
      new Request("http://x/v1/ops/invites/tree", { method: "GET" }),
      new URL("http://x/v1/ops/invites/tree"),
      routeDeps(true),
    );
    expect(res.status).toBe(401);
  });

  test("GET /v1/ops/invites/tree with bearer returns tree", async () => {
    const deps = routeDeps(true);
    const repo = deps.ctx.invitesRepo;
    if (repo === undefined) throw new Error("expected invites repo");
    const [tok] = repo.mintStandardInviteTokens("did:test:a", 1);
    if (tok === undefined) throw new Error("expected token");
    expect(repo.tryConsumeInviteToken(tok, "did:test:b")).toBe(true);

    const res = await handleAdminInviteTree(
      new Request("http://x/v1/ops/invites/tree?did=did:test:a", {
        method: "GET",
        headers: { Authorization: `Bearer ${ROOT_TOKEN}` },
      }),
      new URL("http://x/v1/ops/invites/tree?did=did:test:a"),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rootDid: string;
      descendants: Array<{ did: string }>;
    };
    expect(body.rootDid).toBe("did:test:a");
    expect(body.descendants.map((n) => n.did)).toEqual(["did:test:b"]);
  });

  test("GET /v1/ops/invites/tree without did walks root frontier", async () => {
    const deps = routeDeps(true);
    const repo = deps.ctx.invitesRepo;
    if (repo === undefined) throw new Error("expected invites repo");
    expect(repo.insertSeedInviteTokens(["seed-frontier-token"])).toBe(1);
    expect(repo.tryConsumeInviteToken("seed-frontier-token", "did:test:rootling")).toBe(true);
    const childToks = repo.mintStandardInviteTokens("did:test:rootling", 1, {
      parentPlaintext: "seed-frontier-token",
    });
    const [childTok] = childToks;
    if (childTok === undefined) throw new Error("expected child token");
    expect(repo.tryConsumeInviteToken(childTok, "did:test:grandchild")).toBe(true);

    const res = await handleAdminInviteTree(
      new Request("http://x/v1/ops/invites/tree?depth=2", {
        method: "GET",
        headers: { Authorization: `Bearer ${ROOT_TOKEN}` },
      }),
      new URL("http://x/v1/ops/invites/tree?depth=2"),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rootDid: string;
      descendants: Array<{ did: string; depth: number }>;
      ancestors: unknown[];
    };
    expect(body.rootDid).toBe("");
    expect(body.ancestors).toEqual([]);
    expect(body.descendants.map((n) => n.did)).toContain("did:test:rootling");
    expect(body.descendants.map((n) => n.did)).toContain("did:test:grandchild");
  });
});

describe("agent invite tree", () => {
  test("GET /v1/invites/tree requires agent auth", async () => {
    const deps: HostRouteDeps = {
      ctx: {
        auth: {
          requireAuthenticatedRequest: async () => {
            throw new Error("unauthorized");
          },
        },
        invitesRepo: undefined,
      } as unknown as KhoraHostContext,
      rateLimiters: {
        invitesListDid: () => ({ ok: true }),
      } as unknown as HostRouteDeps["rateLimiters"],
      adminTokenAuth: createRootTokenAdminAuth({ rootToken: ROOT_TOKEN }),
    };
    const res = await handleInviteTree(
      new Request("http://x/v1/invites/tree", { method: "GET" }),
      new URL("http://x/v1/invites/tree"),
      deps,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("GET /v1/invites/tree returns ancestors and descendants for caller", async () => {
    const db = new Database(":memory:");
    const repo = createKhoraInvitesSqliteRepo(db, INVITE_PEPPER);
    const [tok] = repo.mintStandardInviteTokens("did:test:parent", 1);
    if (tok === undefined) throw new Error("expected token");
    expect(repo.tryConsumeInviteToken(tok, "did:test:self")).toBe(true);
    const childToks = repo.mintStandardInviteTokens("did:test:self", 1, {
      parentPlaintext: tok,
    });
    const [childTok] = childToks;
    if (childTok === undefined) throw new Error("expected child");
    expect(repo.tryConsumeInviteToken(childTok, "did:test:child")).toBe(true);

    const deps: HostRouteDeps = {
      ctx: {
        auth: {
          requireAuthenticatedRequest: async () => ({ did: "did:test:self" }),
        },
        invitesRepo: repo,
        host: {
          persistenceClient: {
            registrationExists: (did: string) =>
              did === "did:test:self" || did === "did:test:child" || did === "did:test:parent",
          },
        },
      } as unknown as KhoraHostContext,
      rateLimiters: {
        invitesListDid: () => ({ ok: true }),
      } as unknown as HostRouteDeps["rateLimiters"],
      adminTokenAuth: createRootTokenAdminAuth({ rootToken: ROOT_TOKEN }),
    };
    const res = await handleInviteTree(
      new Request("http://x/v1/invites/tree", { method: "GET" }),
      new URL("http://x/v1/invites/tree"),
      deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rootDid: string;
      descendants: Array<{ did: string; active: boolean }>;
      ancestors: Array<{ did: string }>;
      truncated: boolean;
    };
    expect(body.rootDid).toBe("did:test:self");
    expect(body.descendants.map((n) => n.did)).toEqual(["did:test:child"]);
    expect(body.descendants[0]?.active).toBe(true);
    expect(body.ancestors.map((n) => n.did)).toEqual(["did:test:parent"]);
    expect(body.truncated).toBe(false);
    db.close();
  });
});
