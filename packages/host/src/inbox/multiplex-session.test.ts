import { describe, expect, test } from "bun:test";
import { bindErrorFrame, boundFrame, drainFrame, helloFrame } from "./multiplex-session";
import { createInboxWsHub } from "./ws-hub";

describe("multiplex inbox hub", () => {
  test("broadcast tags did and removeSession clears all binds", () => {
    const hub = createInboxWsHub();
    const sent: string[] = [];
    const ws = {
      send(data: string) {
        sent.push(data);
        return data.length;
      },
    };
    hub.add("did:a", ws);
    hub.add("did:b", ws);
    expect(hub.listenerCount("did:a")).toBe(1);
    expect(hub.listenerCount("did:b")).toBe(1);
    hub.broadcast("did:a", { type: "notification", id: 1, notification: { kind: "host" } });
    expect(sent[0]).toBeDefined();
    expect(JSON.parse(sent[0] ?? "")).toMatchObject({
      type: "notification",
      did: "did:a",
      id: 1,
    });
    hub.removeSession(ws);
    expect(hub.listenerCount("did:a")).toBe(0);
    expect(hub.listenerCount("did:b")).toBe(0);
  });

  test("frame helpers", () => {
    expect(JSON.parse(helloFrame("c1"))).toEqual({ type: "hello", connection_id: "c1" });
    expect(JSON.parse(boundFrame("did:x"))).toEqual({ type: "bound", did: "did:x" });
    expect(JSON.parse(bindErrorFrame("did:x", "nope"))).toEqual({
      type: "bind_error",
      did: "did:x",
      error: "nope",
    });
    expect(JSON.parse(drainFrame("did:x", []))).toEqual({ type: "drain", did: "did:x", items: [] });
  });
});
