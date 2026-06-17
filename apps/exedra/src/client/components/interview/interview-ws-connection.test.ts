import { describe, expect, test } from "bun:test";

import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, reconnectDelay } from "./interview-ws-connection";

describe("reconnectDelay", () => {
  test("uses exponential backoff capped at max", () => {
    expect(reconnectDelay(0)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelay(1)).toBe(RECONNECT_BASE_MS * 2);
    expect(reconnectDelay(2)).toBe(RECONNECT_BASE_MS * 4);
    expect(reconnectDelay(10)).toBe(RECONNECT_MAX_MS);
  });
});
