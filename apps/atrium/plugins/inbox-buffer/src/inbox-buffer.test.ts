import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AtriumClientEvent } from "@khoralabs/atrium-client";
import { createInboxBuffer, INBOX_CLIENT_EVENT_TYPES } from "./index.ts";

describe("createInboxBuffer", () => {
  test("stores events and compacts by dropEventTypes then maxEntries", () => {
    let listener: ((e: AtriumClientEvent) => void) | undefined;
    const client = {
      subscribe: (fn: (e: AtriumClientEvent) => void) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
    };
    const dbPath = join(mkdtempSync(join(tmpdir(), "atrium-buf-")), "buf.sqlite");
    const buf = createInboxBuffer({ client, dbPath });
    listener?.({ type: "topic:subscribed", did: "did:key:a", topicSlug: "x" });
    listener?.({
      type: "inbox:notification",
      did: "did:key:a",
      id: 1,
      notification: {
        kind: "inbox_post",
        payload: {
          postId: "p",
          postKind: "post",
          reasons: [{ kind: "topic", topic: "t" }],
        },
      },
    });
    listener?.({ type: "post:deleted", did: "did:key:a", postId: "p1" });
    expect(buf.stats().count).toBe(3);
    buf.compact({
      maxEntries: 10,
      dropEventTypes: [...INBOX_CLIENT_EVENT_TYPES],
    });
    expect(buf.stats().count).toBe(2);
    buf.compact({ maxEntries: 1 });
    expect(buf.stats().count).toBe(1);
    buf.close();
    rmSync(dirname(dbPath), { recursive: true });
  });

  test("compactAfterAppend applies policy", () => {
    let listener: ((e: AtriumClientEvent) => void) | undefined;
    const client = {
      subscribe: (fn: (e: AtriumClientEvent) => void) => {
        listener = fn;
        return () => {
          listener = undefined;
        };
      },
    };
    const dbPath = join(mkdtempSync(join(tmpdir(), "atrium-buf-")), "buf.sqlite");
    const buf = createInboxBuffer({
      client,
      dbPath,
      compactAfterAppend: true,
      compactPolicy: { maxEntries: 1 },
    });
    listener?.({ type: "topic:subscribed", did: "did:key:a", topicSlug: "a" });
    listener?.({ type: "topic:subscribed", did: "did:key:a", topicSlug: "b" });
    expect(buf.stats().count).toBe(1);
    buf.close();
    rmSync(dirname(dbPath), { recursive: true });
  });
});
