import { describe, expect, test } from "bun:test";

import type { TurnEvent } from "./turn-engine/events.js";
import { registerTurnRelay, relayTurnEvent } from "./turn-relay.js";

describe("turn relay", () => {
  test("forwards events to registered listeners", () => {
    const threadId = "thread-1";
    const received: TurnEvent[] = [];
    const cleanup = registerTurnRelay(threadId, (event) => {
      received.push(event);
    });

    relayTurnEvent(threadId, { type: "text_delta", turnId: "turn-1", delta: "hi" });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "text_delta", turnId: "turn-1", delta: "hi" });

    cleanup();
    relayTurnEvent(threadId, { type: "text_delta", turnId: "turn-1", delta: "ignored" });
    expect(received).toHaveLength(1);
  });
});
