import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { OperatorFeedPost } from "@khoralabs/khora-contracts";
import { encodePostId } from "../../lib/post-address-id";
import type { PostResolver } from "../../ports";
import {
  createSqliteOperatorPostFeedReader,
  OperatorPostFeedBadRequest,
} from "./operator-post-feed";

function installMinimalSchema(db: Database): void {
  db.exec(`
    CREATE TABLE memories (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'node',
      suppressed INTEGER NOT NULL DEFAULT 0,
      _id INTEGER PRIMARY KEY AUTOINCREMENT,
      _ts_created INTEGER NOT NULL
    );
    CREATE TABLE nodes (
      memory_id INTEGER NOT NULL,
      value TEXT,
      properties TEXT,
      _id INTEGER PRIMARY KEY AUTOINCREMENT,
      _ts_created INTEGER NOT NULL
    );
    CREATE TABLE node_labels (
      kind TEXT NOT NULL,
      description TEXT,
      schema TEXT,
      _id INTEGER PRIMARY KEY AUTOINCREMENT,
      _ts_created INTEGER NOT NULL
    );
    CREATE TABLE node_label_assignments (
      node_id INTEGER NOT NULL,
      label_id INTEGER NOT NULL,
      props TEXT,
      _id INTEGER PRIMARY KEY AUTOINCREMENT,
      _ts_created INTEGER NOT NULL
    );
  `);
}

function insertIndexedPost(
  db: Database,
  opts: {
    postId: string;
    profileId: string;
    ts: number;
    labelKind: "khora_post" | "khora_subscription";
    topics?: string[];
    postKind?: "post" | "status";
  },
): void {
  const ns = `global/agents/${opts.profileId}/posts`;
  const mem = db
    .query(
      `INSERT INTO memories (namespace, key, kind, suppressed, _ts_created)
       VALUES (?, ?, 'node', 0, ?) RETURNING _id`,
    )
    .get(ns, opts.postId, opts.ts) as { _id: number };
  const node = db
    .query(`INSERT INTO nodes (memory_id, value, _ts_created) VALUES (?, ?, ?) RETURNING _id`)
    .get(mem._id, opts.postId, opts.ts) as { _id: number };

  let label = db.query(`SELECT _id FROM node_labels WHERE kind = ?`).get(opts.labelKind) as {
    _id: number;
  } | null;
  if (label === null) {
    label = db
      .query(`INSERT INTO node_labels (kind, _ts_created) VALUES (?, ?) RETURNING _id`)
      .get(opts.labelKind, opts.ts) as { _id: number };
  }

  const props: Record<string, unknown> = {
    postId: opts.postId,
    authorProfileId: opts.profileId,
  };
  if (opts.labelKind === "khora_post") {
    props.kind = opts.postKind ?? "post";
  }
  if (opts.topics !== undefined) props.topics = opts.topics;

  db.query(
    `INSERT INTO node_label_assignments (node_id, label_id, props, _ts_created)
     VALUES (?, ?, ?, ?)`,
  ).run(node._id, label._id, JSON.stringify(props), opts.ts);
}

function postIdFor(did: string, n: number): string {
  return encodePostId({
    authorPrincipalId: did,
    recordKey: `rec-${n}`,
    cellPoolCount: 1,
  });
}

function mockResolver(
  posts: Map<
    string,
    Parameters<PostResolver["resolvePostById"]> extends [infer _I]
      ? Awaited<ReturnType<PostResolver["resolvePostById"]>>
      : never
  >,
): PostResolver {
  return {
    async resolvePostById(id) {
      return posts.get(id);
    },
    async listAuthorOutboxRecords() {
      return [];
    },
    async deletePostOutboxRecord() {
      return false;
    },
  };
}

describe("createSqliteOperatorPostFeedReader", () => {
  test("lists newest-first with cursor pagination", async () => {
    const db = new Database(":memory:");
    installMinimalSchema(db);
    const did = "did:key:author";
    const ids = [1, 2, 3].map((n) => postIdFor(did, n));
    const store = new Map<
      string,
      NonNullable<Awaited<ReturnType<PostResolver["resolvePostById"]>>>
    >();
    for (const [i, id] of ids.entries()) {
      insertIndexedPost(db, {
        postId: id,
        profileId: "prof-a",
        ts: 1000 + i,
        labelKind: "khora_post",
        topics: ["alpha"],
      });
      store.set(id, {
        id,
        kind: "post",
        visibility: "public",
        authorSignature: "sig",
        body: `body-${i}`,
        topics: ["alpha"],
      });
    }

    const reader = createSqliteOperatorPostFeedReader({
      db,
      postResolver: mockResolver(store),
      namespaceRoot: "global",
      profileIdForPrincipal: (p) => (p === did ? "prof-a" : undefined),
    });

    const page1 = await reader.list({ limit: 2 });
    expect(page1.items.map((p) => p.body)).toEqual(["body-2", "body-1"]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.watermarkMs).toBe(1002);

    const page2 = await reader.list({
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((p) => p.body)).toEqual(["body-0"]);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeNull();
  });

  test("filters by authorDid and AND tags; includes kinds and visibilities", async () => {
    const db = new Database(":memory:");
    installMinimalSchema(db);
    const a = "did:key:a";
    const b = "did:key:b";
    const store = new Map<
      string,
      NonNullable<Awaited<ReturnType<PostResolver["resolvePostById"]>>>
    >();

    const cases: Array<{
      did: string;
      profile: string;
      n: number;
      ts: number;
      label: "khora_post" | "khora_subscription";
      kind: OperatorFeedPost["kind"];
      visibility: OperatorFeedPost["visibility"];
      topics: string[];
      body?: string;
      search?: OperatorFeedPost["search"];
    }> = [
      {
        did: a,
        profile: "pa",
        n: 1,
        ts: 10,
        label: "khora_post",
        kind: "post",
        visibility: "private",
        topics: ["buy", "ltl"],
        body: "a-post",
      },
      {
        did: a,
        profile: "pa",
        n: 2,
        ts: 20,
        label: "khora_post",
        kind: "status",
        visibility: "network",
        topics: ["buy"],
        body: "a-status",
      },
      {
        did: a,
        profile: "pa",
        n: 3,
        ts: 30,
        label: "khora_subscription",
        kind: "subscription",
        visibility: "public",
        topics: ["buy", "ltl"],
        body: "standing",
        search: { content: { text: "ltl freight" } },
      },
      {
        did: b,
        profile: "pb",
        n: 4,
        ts: 40,
        label: "khora_post",
        kind: "post",
        visibility: "public",
        topics: ["buy", "ltl"],
        body: "b-post",
      },
    ];

    for (const c of cases) {
      const id = postIdFor(c.did, c.n);
      insertIndexedPost(db, {
        postId: id,
        profileId: c.profile,
        ts: c.ts,
        labelKind: c.label,
        topics: c.topics,
        postKind: c.kind === "status" ? "status" : "post",
      });
      store.set(id, {
        id,
        kind: c.kind,
        visibility: c.visibility,
        authorSignature: "sig",
        body: c.body,
        topics: c.topics,
        ...(c.search !== undefined ? { search: c.search } : {}),
      });
    }

    const reader = createSqliteOperatorPostFeedReader({
      db,
      postResolver: mockResolver(store),
      namespaceRoot: "global",
      profileIdForPrincipal: (p) => (p === a ? "pa" : p === b ? "pb" : undefined),
    });

    const filtered = await reader.list({
      limit: 10,
      authorDid: a,
      tags: ["buy", "ltl"],
    });
    expect(filtered.items.map((p) => p.body)).toEqual(["standing", "a-post"]);
    expect(filtered.items.map((p) => p.kind)).toEqual(["subscription", "post"]);
    expect(filtered.items.map((p) => p.visibility)).toEqual(["public", "private"]);
    expect(filtered.items[0]?.search?.content.text).toBe("ltl freight");
  });

  test("skips deleted posts and counts newer exactly", async () => {
    const db = new Database(":memory:");
    installMinimalSchema(db);
    const did = "did:key:x";
    const store = new Map<
      string,
      NonNullable<Awaited<ReturnType<PostResolver["resolvePostById"]>>>
    >();
    const live = postIdFor(did, 1);
    const ghost = postIdFor(did, 2);
    insertIndexedPost(db, {
      postId: ghost,
      profileId: "px",
      ts: 200,
      labelKind: "khora_post",
    });
    insertIndexedPost(db, {
      postId: live,
      profileId: "px",
      ts: 100,
      labelKind: "khora_post",
    });
    store.set(live, {
      id: live,
      kind: "post",
      visibility: "public",
      authorSignature: "sig",
      body: "live",
    });
    // ghost intentionally missing from resolver

    const reader = createSqliteOperatorPostFeedReader({
      db,
      postResolver: mockResolver(store),
      namespaceRoot: "global",
      profileIdForPrincipal: () => "px",
    });

    const listed = await reader.list({ limit: 10 });
    expect(listed.items.map((p) => p.body)).toEqual(["live"]);

    const count = await reader.newerCount({ afterMs: 50 });
    expect(count.count).toBe(2);

    const countNone = await reader.newerCount({ afterMs: 200 });
    expect(countNone.count).toBe(0);
  });

  test("rejects malformed cursor", async () => {
    const db = new Database(":memory:");
    installMinimalSchema(db);
    const reader = createSqliteOperatorPostFeedReader({
      db,
      postResolver: mockResolver(new Map()),
      namespaceRoot: "global",
      profileIdForPrincipal: () => undefined,
    });
    await expect(reader.list({ limit: 1, cursor: "not-a-cursor" })).rejects.toBeInstanceOf(
      OperatorPostFeedBadRequest,
    );
  });
});
