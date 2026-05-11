import { describe, expect, mock, test } from "bun:test";
import { OBPPersistenceClient } from "@cfd/obp-core";
import { createMonotonicLedgerSeq } from "./ledger-seq.ts";
import { runLinearObpFlow } from "./linear-runner.ts";

describe("runLinearObpFlow", () => {
  test("two-step linear records binds per step", async () => {
    const readBinding: string[] = [];
    const readLine = mock(async (prompt: string) => {
      readBinding.push(prompt);
      if (prompt.includes("Kind")) return "post";
      if (prompt.includes("Body")) return "hello world";
      return "";
    });

    const obp = new OBPPersistenceClient({ ledgerSeq: createMonotonicLedgerSeq() });

    const result = await runLinearObpFlow({
      obp,
      partyName: "test-cli",
      rootOfferType: "atrium.test.root",
      transitions: [
        {
          stepId: "kind",
          title: "Pick kind",
          bindPolicy: {
            version: "1",
            properties: [
              {
                type: "choice",
                name: "Kind",
                prompt: "Kind",
                constraints: { choices: ["post", "probe", "status"], maxSelections: 1 },
              },
            ],
          },
          nextOfferType: "atrium.test.mid",
        },
        {
          stepId: "body",
          title: "Body",
          bindPolicy: {
            version: "1",
            properties: [
              { type: "text", name: "Body", prompt: "Body text", constraints: { minLength: 1 } },
            ],
          },
          nextOfferType: "atrium.test.done",
          terminal: true,
        },
      ],
      readLine,
    });

    expect(result.bindsByStep.kind?.kind).toBe("post");
    expect(result.bindsByStep.body?.body).toBe("hello world");
    expect(obp.listExposedPortEdges().length).toBeGreaterThan(0);
  });
});
