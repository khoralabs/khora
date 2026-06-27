import { expect, test } from "bun:test";

import type { FlowDefinition } from "./flow-types";
import { createInMemoryFlowChainView } from "./in-memory-chain";
import { runOfferFlow } from "./run-offer-flow";
import { runFlow } from "./runner";
import { getOfferRow, seedMapFromOffer } from "./seed-helpers";

const def: FlowDefinition = {
  id: "test-flow",
  offers: [
    {
      id: "step1",
      ports: [
        { id: "a", prompt: "A? " },
        { id: "b", prompt: "B? ", optional: true },
      ],
    },
  ],
};

test("runFlow collects required and optional ports", async () => {
  const reads: string[] = [];
  const readLine = (q: string) => {
    if (q === "A? ") {
      reads.push("a1");
      return Promise.resolve("a1");
    }
    reads.push("");
    return Promise.resolve("");
  };
  const { valuesByOffer } = await runFlow(def, {
    readLine,
    chain: createInMemoryFlowChainView(),
  });
  expect(valuesByOffer.step1?.a).toBe("a1");
  expect(valuesByOffer.step1?.b).toBeUndefined();
});

test("runFlow uses seedStringValues for required port", async () => {
  let calls = 0;
  const readLine = (_q: string) => {
    calls++;
    return Promise.resolve("");
  };
  const seeds = new Map<string, string>([["step1::a", "seeded"]]);
  const { valuesByOffer } = await runFlow(def, {
    readLine,
    chain: createInMemoryFlowChainView(),
    seedStringValues: seeds,
  });
  expect(calls).toBe(1);
  expect(valuesByOffer.step1?.a).toBe("seeded");
});

test("createInMemoryFlowChainView seed supplies existingStringValue", async () => {
  const seeds = new Map<string, string>([["o::p", "from-chain"]]);
  const chain = createInMemoryFlowChainView(seeds);
  expect(chain.existingStringValue("o", "p")).toBe("from-chain");
});

test("seedMapFromOffer skips empty keys", () => {
  const m = seedMapFromOffer("o", { a: "x", b: "", c: undefined });
  expect([...m.entries()]).toEqual([["o::a", "x"]]);
});

test("getOfferRow throws when offer missing", () => {
  expect(() => getOfferRow({ valuesByOffer: {} }, "missing")).toThrow(/missing offer/);
});

test("runOfferFlow matches runFlow + getOfferRow for one offer", async () => {
  let n = 0;
  const readLine = () => {
    n++;
    return Promise.resolve("");
  };
  const row = await runOfferFlow({
    readLine,
    def,
    offerId: "step1",
    partialSeeds: { a: "seeded" },
  });
  expect(n).toBe(1);
  expect(row.a).toBe("seeded");
  expect(row.b).toBeUndefined();
});
