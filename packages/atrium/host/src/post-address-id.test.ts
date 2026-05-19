import { expect, test } from "bun:test";
import { decodePostId, encodePostId } from "./post-address-id.ts";

const goldenAddress = {
  authorPrincipalId: "did:plc:abc123",
  authorCellId: "cell-0007",
  recordKey: "ob_a1b2c3d4e5f6789012345678901234ab",
};

test("encodePostId / decodePostId round-trip", () => {
  const id = encodePostId(goldenAddress);
  expect(id.startsWith("atp1:")).toBe(true);
  expect(decodePostId(id)).toEqual(goldenAddress);
});

test("decodePostId rejects invalid ids", () => {
  expect(decodePostId("not-a-post-id")).toBeUndefined();
  expect(decodePostId("atp1:!!!")).toBeUndefined();
  expect(decodePostId("")).toBeUndefined();
});
