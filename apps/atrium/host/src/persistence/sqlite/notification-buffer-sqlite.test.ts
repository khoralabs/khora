import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { createSqliteAgentNotificationBuffer } from "./notification-buffer-sqlite.ts";
import { ensureSwarmHostSqliteSchema } from "./schema.ts";

describe("createSqliteAgentNotificationBuffer", () => {
  test("enqueue, listRecent, markRead", async () => {
    const db = new Database(":memory:");
    ensureSwarmHostSqliteSchema(db);
    const buf = createSqliteAgentNotificationBuffer(db);
    const did = "did:example:alice" as const;
    const id = await buf.enqueue(did, {
      kind: "topic_post",
      payload: { topicSlug: "alpha", postId: "p1" },
    });
    expect(id).toBeGreaterThan(0);
    const rows = await buf.listRecent?.(did, 10);
    expect(rows?.length).toBe(1);
    expect(rows?.[0]?.readAtMs).toBeNull();
    await buf.markRead?.(did, [id]);
    const rows2 = await buf.listRecent?.(did, 10);
    expect(rows2?.[0]?.readAtMs).not.toBeNull();
  });
});
