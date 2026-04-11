import { describe, expect, test } from "bun:test";
import { defineOntology } from "@cfd/memories";
import z from "zod";
import { buildLibrarianMergePlanDescription, zLibrarianMergePlanWire } from "./plan";

describe("processLogicalMemoryWithLibrarian (schema + prompts)", () => {
  test("zLibrarianMergePlanWire accepts empty labels and edges", () => {
    const ontology = defineOntology({
      nodeLabels: { event: z.object({}), fact: z.object({}) },
      edgeLabels: { references: z.object({}) },
    });
    const schema = zLibrarianMergePlanWire(ontology);
    const plan = schema.parse({ labels: [], edges: [] });
    expect(plan.labels).toEqual([]);
    expect(plan.edges).toEqual([]);
  });

  test("edge memory_key description is present for LLM guidance", () => {
    const ontology = defineOntology({
      nodeLabels: { fact: z.object({}) },
      edgeLabels: { references: z.object({}) },
    });
    const schema = zLibrarianMergePlanWire(ontology);
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
    expect(d.toLowerCase()).toContain("bare strings");
    expect(d).toContain("event");
    expect(d).toContain("references");
  });

  test("node labels accept string shorthand for a valid kind", () => {
    const ontology = defineOntology({
      nodeLabels: { fact: z.object({}), observation: z.object({}) },
      edgeLabels: {},
    });
    const schema = zLibrarianMergePlanWire(ontology);
    const plan = schema.parse({ labels: ["fact"], edges: [] });
    expect(plan.labels[0]).toEqual({ kind: "fact", props: {} });
  });

  test("node label string shorthand rejects kinds outside ontology", () => {
    const ontology = defineOntology({
      nodeLabels: { fact: z.object({}) },
      edgeLabels: {},
    });
    const schema = zLibrarianMergePlanWire(ontology);
    expect(() => schema.parse({ labels: ["personal"], edges: [] })).toThrow();
  });

  test("node label props are validated against ontology schema", () => {
    const ontology = defineOntology({
      nodeLabels: { person: z.object({ role: z.string() }) },
      edgeLabels: {},
    });
    const schema = zLibrarianMergePlanWire(ontology);
    const plan = schema.parse({
      labels: [{ kind: "person", props: { role: "author" } }],
      edges: [],
    });
    expect(plan.labels[0]).toEqual({ kind: "person", props: { role: "author" } });
    expect(() =>
      schema.parse({
        labels: [{ kind: "person", props: { role: 1 } }],
        edges: [],
      }),
    ).toThrow();
  });
});
