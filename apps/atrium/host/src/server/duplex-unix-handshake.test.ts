import { describe, expect, test } from "bun:test";
import { parseDuplexUnixHandshakeJson } from "./duplex-unix-handshake.ts";

describe("parseDuplexUnixHandshakeJson", () => {
  test("accepts room envelope", () => {
    expect(
      parseDuplexUnixHandshakeJson({ kind: "room", roomId: "r1", ticket: "t1" }),
    ).toEqual({ kind: "room", roomId: "r1", ticket: "t1" });
  });

  test("accepts inbox envelope", () => {
    expect(
      parseDuplexUnixHandshakeJson({
        kind: "inbox",
        did: "did:x",
        ts: "1",
        nonce: "n",
        sig: "s",
      }),
    ).toEqual({
      kind: "inbox",
      did: "did:x",
      ts: "1",
      nonce: "n",
      sig: "s",
    });
  });

  test("rejects unknown kind", () => {
    expect(() =>
      parseDuplexUnixHandshakeJson({ kind: "other", roomId: "x", ticket: "y" }),
    ).toThrow();
  });

  test("rejects malformed payloads", () => {
    expect(() => parseDuplexUnixHandshakeJson({ kind: "room", roomId: "" })).toThrow();
    expect(() =>
      parseDuplexUnixHandshakeJson({ kind: "inbox", did: "d", ts: "t", nonce: "n" }),
    ).toThrow();
  });
});
