import { describe, expect, test } from "bun:test";
import { assembleToolkitAgentInstructions } from "./assemble-toolkit-instructions.js";
import type { ToolkitResult } from "./types.js";

function spec(name: string, instructions: string) {
  return {
    name,
    description: "d",
    inputSchema: {} as ToolkitResult["tools"][string]["inputSchema"],
    instructions,
    handler: async () => undefined,
  };
}

describe("assembleToolkitAgentInstructions", () => {
  test("uses merged instructions only when tool text is already embedded", () => {
    const toolText = "Use the tool for X.";
    const merged = `Intro.\n\n${toolText}`;
    const evaluated: Pick<ToolkitResult, "tools" | "instructions"> = {
      instructions: merged,
      tools: { my_tool: spec("my_tool", toolText) },
    };
    expect(assembleToolkitAgentInstructions(evaluated)).toBe(merged);
  });

  test("appends headed tool block when not substring of merged", () => {
    const evaluated: Pick<ToolkitResult, "tools" | "instructions"> = {
      instructions: "Toolkit level only.",
      tools: { b_tool: spec("b_tool", "B only."), a_tool: spec("a_tool", "A only.") },
    };
    const out = assembleToolkitAgentInstructions(evaluated);
    expect(out).toContain("Toolkit level only.");
    expect(out).toContain("## a_tool");
    expect(out).toContain("A only.");
    expect(out.indexOf("## a_tool")).toBeLessThan(out.indexOf("## b_tool"));
  });
});
