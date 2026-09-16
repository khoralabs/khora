import { expect, test } from "bun:test";
import type { Signer } from "@khoralabs/did-key-identity";
import { KhoraClient } from "./khora-client";

const signer: Signer = {
  did: "did:test:admin",
  sign: async () => new Uint8Array(64),
};

test("typed client sends admin token and paginated receipt query", async () => {
  const client = new KhoraClient({
    baseUrl: "http://host",
    signer,
    adminToken: "root-token",
    fetch: async (input, init) => {
      expect(String(input)).toBe(
        "http://host/v1/ops/delivery-receipts/post%2F1/targets?limit=2&cursor=7",
      );
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer root-token");
      return Response.json({
        available: true,
        items: [{ ordinal: 8, did: "did:test:eight" }],
        nextCursor: null,
        hasMore: false,
      });
    },
  });
  expect(await client.deliveryReceiptTargets("post/1", { limit: 2, cursor: "7" })).toMatchObject({
    available: true,
    items: [{ did: "did:test:eight" }],
  });
});
