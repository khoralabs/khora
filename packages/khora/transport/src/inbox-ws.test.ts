import { describe, expect, test } from "bun:test";
import { inboxWebSocketUrl, parseInboxWebSocketMessage } from "./inbox-ws";

describe("parseInboxWebSocketMessage", () => {
  test("snapshot", () => {
    const raw = JSON.stringify({
      type: "snapshot",
      notifications: [
        {
          id: 1,
          createdAtMs: 100,
          read: false,
          notification: {
            kind: "inbox_post",
            payload: {
              postId: "b",
              postKind: "post",
              reasons: [{ kind: "standing_query", queryPostId: "a", score: 0.9 }],
            },
          },
        },
      ],
    });
    const msg = parseInboxWebSocketMessage(raw);
    expect(msg?.type).toBe("snapshot");
    if (msg?.type !== "snapshot") return;
    expect(msg.notifications[0]?.notification.kind).toBe("inbox_post");
  });

  test("live notification", () => {
    const raw = JSON.stringify({
      type: "notification",
      id: 2,
      notification: {
        kind: "inbox_post",
        payload: {
          postId: "y",
          postKind: "post",
          reasons: [{ kind: "topic", topic: "x" }],
        },
      },
    });
    const msg = parseInboxWebSocketMessage(raw);
    expect(msg?.type).toBe("notification");
    if (msg?.type !== "notification") return;
    expect(msg.id).toBe(2);
    expect(msg.notification.kind).toBe("inbox_post");
  });

  test("drain batch", () => {
    const raw = JSON.stringify({
      type: "drain",
      items: [
        {
          entryKey: "did:key:a/p1",
          pointer: { source_cell_id: "relay", source_record_key: "p1", content_hash: "ab" },
          projection: { postId: "p1" },
        },
      ],
    });
    const msg = parseInboxWebSocketMessage(raw);
    expect(msg?.type).toBe("drain");
    if (msg?.type !== "drain") return;
    expect(msg.items).toHaveLength(1);
    expect(msg.items[0]?.entryKey).toBe("did:key:a/p1");
  });

  test("invalid json returns undefined", () => {
    expect(parseInboxWebSocketMessage("not json")).toBeUndefined();
  });

  test("wrong shape returns undefined", () => {
    expect(parseInboxWebSocketMessage(JSON.stringify({ type: "other" }))).toBeUndefined();
  });
});

describe("inboxWebSocketUrl", () => {
  test("http to ws with did query", () => {
    expect(inboxWebSocketUrl("http://localhost:8787", "did:key:1")).toBe(
      "ws://localhost:8787/v1/inbox/ws?did=did%3Akey%3A1",
    );
  });

  test("https to wss", () => {
    expect(inboxWebSocketUrl("https://khora.example/", "did:x:y")).toContain("wss://");
    expect(inboxWebSocketUrl("https://khora.example/", "did:x:y")).toContain("did=did%3Ax%3Ay");
  });
});
