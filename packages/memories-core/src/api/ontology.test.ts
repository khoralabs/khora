import { describe, expect, test } from "bun:test";
import z from "zod";
import {
  defineOntology,
  edgeLabelPropsSchema,
  nodeLabelPropsSchema,
  zodPropsSchemaToJson,
} from "./ontology";

describe("ontology narrow helpers", () => {
  const ontology = defineOntology({
    nodeLabels: {
      topic: z.object({ weight: z.number().optional() }),
      pinned: z.object({}),
    },
    edgeLabels: {
      relates_to: z.object({ strength: z.number() }),
    },
  });

  test("nodeLabelPropsSchema returns Zod schema for known kind", () => {
    const s = nodeLabelPropsSchema(ontology, "topic");
    expect(s).toBeDefined();
    expect(s!.parse({ weight: 0.5 })).toEqual({ weight: 0.5 });
  });

  test("nodeLabelPropsSchema returns undefined for unknown kind", () => {
    expect(nodeLabelPropsSchema(ontology, "missing")).toBeUndefined();
  });

  test("edgeLabelPropsSchema returns Zod schema for known kind", () => {
    const s = edgeLabelPropsSchema(ontology, "relates_to");
    expect(s).toBeDefined();
    expect(s!.parse({ strength: 0.5 })).toEqual({ strength: 0.5 });
  });

  test("zodPropsSchemaToJson produces an object", () => {
    const j = zodPropsSchemaToJson(z.object({ a: z.number() }));
    expect(j).toBeDefined();
    expect(typeof j).toBe("object");
  });
});
