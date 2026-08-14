import { expect, test } from "bun:test";
import { derivePoolHomeCell } from "@khoralabs/colonnade";
import { decodePostId, encodePostId } from "./post-address-id";

const goldenAddress = {
  authorPrincipalId: "did:plc:abc123",
  recordKey: "ob_a1b2c3d4e5f6789012345678901234ab",
  cellPoolCount: 16,
};

test("encodePostId / decodePostId round-trip", () => {
  const id = encodePostId(goldenAddress);
  expect(id.startsWith("atp0:")).toBe(true);
  expect(decodePostId(id)).toEqual({
    ...goldenAddress,
    authorCellId: derivePoolHomeCell(goldenAddress.authorPrincipalId, goldenAddress.cellPoolCount),
  });
});

test("decodePostId rejects invalid ids", () => {
  expect(decodePostId("not-a-post-id")).toBeUndefined();
  expect(decodePostId("atp0:!!!")).toBeUndefined();
  expect(decodePostId("atp1:eyJwIjoiYSIsInIiOiJiIiwibiI6MTZ9")).toBeUndefined();
  expect(decodePostId("")).toBeUndefined();
});
