import { expect, test } from "bun:test";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { buildNegotiatorRagContext } from "./build-negotiator-rag-context.ts";

test("buildNegotiatorRagContext whitespace-only thread skips embed and search", async () => {
  const client = {
    search() {
      throw new Error("search should not run");
    },
  } as unknown as Parameters<typeof buildNegotiatorRagContext>[0]["client"];

  const out = await buildNegotiatorRagContext({
    client,
    namespace: "ns/a",
    embeddingModel: {} as EmbeddingModel,
    threadText: "    \n\t  ",
  });
  expect(out).toBe(null);
});
