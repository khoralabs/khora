import { describe, expect, mock, test } from "bun:test";
import { OBPPersistenceClient } from "@khoralabs/obp-persistence-client";
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

  test("skipIf transitions are not prompted and produce no binds", async () => {
    const seen: string[] = [];
    const readLine = mock(async (prompt: string) => {
      seen.push(prompt);
      if (prompt.includes("Kind")) return "post";
      if (prompt.includes("Body")) return "hi";
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
          nextOfferType: "atrium.test.mid1",
        },
        {
          stepId: "probeOnly",
          title: "Probe only",
          skipIf: (b) => b.kind?.kind !== "probe",
          bindPolicy: {
            version: "1",
            properties: [
              {
                type: "text",
                name: "Detail",
                prompt: "Detail text",
                constraints: { minLength: 1 },
              },
            ],
          },
          nextOfferType: "atrium.test.mid2",
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

    expect(result.bindsByStep.probeOnly).toBeUndefined();
    expect(result.bindsByStep.kind?.kind).toBe("post");
    expect(result.bindsByStep.body?.body).toBe("hi");
    expect(seen.some((p) => p.includes("Detail"))).toBe(false);
  });
});
