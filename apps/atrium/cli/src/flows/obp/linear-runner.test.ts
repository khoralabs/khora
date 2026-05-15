import { describe, expect, mock, test } from "bun:test";
import { createInMemoryObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { runLinearObpFlow } from "./linear-runner.ts";

const kindSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: { type: "string" as const, enum: ["post", "probe", "status"], description: "Kind" },
  },
};

const bodySchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["body"],
  properties: {
    body: { type: "string" as const, minLength: 1, description: "Body text" },
  },
};

describe("runLinearObpFlow", () => {
  test("two-step linear records binds per step", async () => {
    const readBinding: string[] = [];
    const readLine = mock(async (prompt: string) => {
      readBinding.push(prompt);
      if (prompt.includes("Kind")) return "post";
      if (prompt.includes("Body")) return "hello world";
      return "";
    });

    const obp = createInMemoryObpPersistenceClient();

    const result = await runLinearObpFlow({
      obp,
      partyName: "test-cli",
      rootOfferType: "atrium.test.root",
      transitions: [
        {
          stepId: "kind",
          title: "Pick kind",
          bindPolicy: kindSchema,
          nextOfferType: "atrium.test.mid",
        },
        {
          stepId: "body",
          title: "Body",
          bindPolicy: bodySchema,
          nextOfferType: "atrium.test.done",
          terminal: true,
        },
      ],
      readLine,
    });

    expect(result.bindsByStep.kind?.kind).toBe("post");
    expect(result.bindsByStep.body?.body).toBe("hello world");
    const { edges } = await obp.listExposedPortEdges();
    expect(edges.length).toBeGreaterThan(0);
  });

  test("skipIf transitions are not prompted and produce no binds", async () => {
    const seen: string[] = [];
    const readLine = mock(async (prompt: string) => {
      seen.push(prompt);
      if (prompt.includes("Kind")) return "post";
      if (prompt.includes("Body")) return "hi";
      return "";
    });

    const obp = createInMemoryObpPersistenceClient();

    const result = await runLinearObpFlow({
      obp,
      partyName: "test-cli",
      rootOfferType: "atrium.test.root",
      transitions: [
        {
          stepId: "kind",
          title: "Pick kind",
          bindPolicy: kindSchema,
          nextOfferType: "atrium.test.mid1",
        },
        {
          stepId: "probeOnly",
          title: "Probe only",
          skipIf: (b) => b.kind?.kind !== "probe",
          bindPolicy: {
            type: "object",
            additionalProperties: false,
            required: ["detail"],
            properties: {
              detail: {
                type: "string",
                minLength: 1,
                description: "Detail text",
              },
            },
          },
          nextOfferType: "atrium.test.mid2",
        },
        {
          stepId: "body",
          title: "Body",
          bindPolicy: bodySchema,
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
