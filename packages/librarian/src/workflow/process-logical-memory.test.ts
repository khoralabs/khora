import { describe, expect, test } from "bun:test";
import z from "zod";
import { buildLibrarianMergePlanDescription, zLibrarianMergePlanWire } from "./plan";

describe("processLogicalMemoryWithLibrarian (schema + prompts)", () => {
  test("zLibrarianMergePlanWire accepts empty labels and edges", () => {
    const schema = zLibrarianMergePlanWire(["event", "fact"], ["references"]);
    const plan = schema.parse({ labels: [], edges: [] });
    expect(plan.labels).toEqual([]);
    expect(plan.edges).toEqual([]);
  });

  test("edge memory_key description is present for LLM guidance", () => {
    const schema = zLibrarianMergePlanWire(["fact"], ["references"]);
    const edges = schema.shape.edges;
    if (!(edges instanceof z.ZodArray)) throw new Error("expected ZodArray");
    const edgeEl = edges.element;
    if (!(edgeEl instanceof z.ZodObject)) throw new Error("expected ZodObject");
    const def = edgeEl.shape.memory_key;
    const desc = def.description;
    expect(desc).toBeDefined();
    expect(String(desc).toLowerCase()).toContain("existing");
  });

  test("merge plan description lists allowed kinds for structured output", () => {
    const d = buildLibrarianMergePlanDescription(["event", "fact"], ["references"]);
    expect(d.toLowerCase()).toContain("node label kinds");
    expect(d).toContain("event");
    expect(d).toContain("references");
  });
});
