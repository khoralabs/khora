import { describe, expect, test } from "bun:test";
import { parseInboxWebSocketMessage } from "./inbox-ws";

describe("parseInboxWebSocketMessage", () => {
  test("hello", () => {
    const msg = parseInboxWebSocketMessage(JSON.stringify({ type: "hello", connection_id: "c1" }));
    expect(msg).toEqual({ type: "hello", connection_id: "c1" });
  });

  test("snapshot requires did", () => {
    const raw = JSON.stringify({
      type: "snapshot",
      did: "did:key:a",
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
              subscriptionMatches: [{ subscriptionId: "a", score: 0.9 }],
            },
          },
        },
      ],
    });
    const msg = parseInboxWebSocketMessage(raw);
    expect(msg?.type).toBe("snapshot");
    if (msg?.type !== "snapshot") return;
    expect(msg.did).toBe("did:key:a");
    expect(msg.notifications[0]?.notification.kind).toBe("inbox_post");
  });

  test("live notification", () => {
    const raw = JSON.stringify({
      type: "notification",
      did: "did:key:a",
      id: 2,
      notification: {
        kind: "inbox_post",
        payload: {
          postId: "y",
          postKind: "post",
          subscriptionMatches: [{ subscriptionId: "sub-x", score: 1 }],
        },
      },
    });
    const msg = parseInboxWebSocketMessage(raw);
    expect(msg?.type).toBe("notification");
    if (msg?.type !== "notification") return;
    expect(msg.did).toBe("did:key:a");
    expect(msg.id).toBe(2);
    expect(msg.notification.kind).toBe("inbox_post");
  });

  test("drain batch", () => {
    const raw = JSON.stringify({
      type: "drain",
      did: "did:key:a",
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
    expect(msg.did).toBe("did:key:a");
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
