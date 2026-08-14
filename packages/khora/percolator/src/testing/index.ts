import { describe, expect, test } from "bun:test";
import { createPercolator } from "../engine";
import type { PercolatorPersistence } from "../persistence/port";
import type { StandingQueryCreate } from "../types";

/** Minimal shared contract checks for a percolator persistence factory. */
export function runPercolatorPersistenceContractTests(
  name: string,
  factory: () => PercolatorPersistence | Promise<PercolatorPersistence>,
): void {
  describe(`percolator persistence contract: ${name}`, () => {
    test("register + evaluate roundtrip", async () => {
      const persistence = await factory();
      const percolator = createPercolator({ persistence });
      const create: StandingQueryCreate = {
        id: "q-1",
        ownerId: "did:test:owner",
        search: { content: { text: "hello" } },
        minScore: 0,
      };
      const q = await percolator.registerQuery(create);
      const matches = await percolator.evaluateCandidate({
        candidateId: "cand-1",
        authorId: "did:test:author",
        namespace: "posts",
        labelKinds: [],
        content: { text: "hello world" },
        createdAtMs: Date.now(),
      });
      expect(matches.some((m) => m.queryId === q.id)).toBe(true);
      await percolator.deleteQuery(q.id);
    });
  });
}
