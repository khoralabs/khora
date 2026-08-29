import { describe, expect, test } from "bun:test";

import {
  decodeCellId,
  encodeCellId,
  principalHomeCellId,
  principalHomeId,
  resolveEncodedDatabasePath,
  validateColonnadeDatabaseId,
} from "../index";

describe("ColonnadeDatabaseId encoding", () => {
  test("round-trips kind and ownerKey", () => {
    const id = { kind: "principal", ownerKey: "did:example:alice" };
    const encoded = encodeCellId(id);
    expect(decodeCellId(encoded)).toEqual(id);
  });

  test("principalHomeCellId is encoded principal home", () => {
    const cellId = principalHomeCellId("did:example:bob");
    expect(decodeCellId(cellId)).toEqual(principalHomeId("did:example:bob"));
  });

  test("rejects path separators", () => {
    expect(() => validateColonnadeDatabaseId({ kind: "a/b", ownerKey: "x" })).toThrow();
    expect(() => validateColonnadeDatabaseId({ kind: "a", ownerKey: "x\\y" })).toThrow();
  });

  test("rejects null characters", () => {
    expect(() => validateColonnadeDatabaseId({ kind: "a\0b", ownerKey: "x" })).toThrow(/null/);
    expect(() => validateColonnadeDatabaseId({ kind: "a", ownerKey: "x\0y" })).toThrow(/null/);
  });

  test("resolveEncodedDatabasePath uses v1 layout", () => {
    const id = { kind: "principal", ownerKey: "p1" };
    const p = resolveEncodedDatabasePath("/data", id);
    expect(p).toContain("/data/v1/");
    expect(p.endsWith("/database.db")).toBe(true);
  });
});
