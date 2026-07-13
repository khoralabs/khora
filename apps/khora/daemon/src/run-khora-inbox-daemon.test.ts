import { describe, expect, test } from "bun:test";
import type { PersistableSigner } from "@khoralabs/did-key-identity";
import type { KhoraClientEvent } from "@khoralabs/khora-transport";
import type { InboxEventSink } from "./inbox-event-sink";
import { runKhoraInboxDaemon } from "./run-khora-inbox-daemon";

function testSigner(did = "did:key:daemon-test"): PersistableSigner {
  return {
    did,
    sign: async () => new Uint8Array(64),
    export: () => "dGVzdA==",
  };
}

describe("runKhoraInboxDaemon", () => {
  test("subscribes to inbox events from connectInbox", async () => {
    const events: KhoraClientEvent[] = [];
    const sink: InboxEventSink = {
      onClientEvent(e) {
        events.push(e);
      },
      onLifecycle() {},
    };

    const signer = testSigner();
    const handle = runKhoraInboxDaemon({
      baseUrl: "http://127.0.0.1:1",
      signer,
      dataDir: "/tmp/khora-daemon-test-unused",
      json: true,
      writePidFile: false,
      sink,
    });

    await new Promise((r) => setTimeout(r, 100));
    handle.close();

    expect(handle).toBeDefined();
  });
});
