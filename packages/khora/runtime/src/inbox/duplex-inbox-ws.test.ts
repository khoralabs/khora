import { describe, expect, test } from "bun:test";
import { createMemoryDuplexByteStreamPair } from "@khoralabs/obp-byte-stream";
import { runInboxDuplexAttachment } from "./duplex-inbox-ws";
import { createInboxWsHub } from "./inbox-ws-hub";

describe("runInboxDuplexAttachment", () => {
  test("broadcast reaches duplex client as UTF-8 JSON line", async () => {
    const hub = createInboxWsHub();
    const [client, serverHalf] = createMemoryDuplexByteStreamPair();
    await runInboxDuplexAttachment({ inboxHub: hub, did: "did:example:a", duplex: serverHalf });
    hub.broadcast("did:example:a", { ping: 1 });

    let decoded = "";
    for await (const chunk of client.read()) {
      decoded = new TextDecoder().decode(chunk);
      break;
    }
    expect(decoded).toBe(JSON.stringify({ ping: 1 }));

    await serverHalf.close();
  });

  test("dispose closes duplex", async () => {
    const hub = createInboxWsHub();
    const [client, serverHalf] = createMemoryDuplexByteStreamPair();
    const { dispose } = await runInboxDuplexAttachment({
      inboxHub: hub,
      did: "did:example:b",
      duplex: serverHalf,
    });
    await dispose();
    expect(hub.listenerCount("did:example:b")).toBe(0);
    let chunkCount = 0;
    for await (const _ of client.read()) {
      chunkCount += 1;
    }
    expect(chunkCount).toBe(0);
  });
});
