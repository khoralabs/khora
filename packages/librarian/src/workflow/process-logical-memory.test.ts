import { describe, expect, test } from "bun:test";
import { zLibrarianMergePlanWire } from "./plan";

describe("processLogicalMemoryWithLibrarian (schema + prompts)", () => {
  test("zLibrarianMergePlanWire accepts empty labels and edges", () => {
    const plan = zLibrarianMergePlanWire.parse({ labels: [], edges: [] });
    expect(plan.labels).toEqual([]);
    expect(plan.edges).toEqual([]);
  });

  test("edge memory_key description is present for LLM guidance", () => {
    const def = zLibrarianMergePlanWire.shape.edges.element.shape.memory_key;
    const desc = def.description;
    expect(desc).toBeDefined();
    expect(String(desc).toLowerCase()).toContain("existing");
  });
});
