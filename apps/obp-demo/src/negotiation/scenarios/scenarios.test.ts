import { describe, expect, test } from "bun:test";
import { getNegotiationScenario, NEGOTIATION_SCENARIO_IDS } from "./index.ts";

describe("negotiation scenarios registry", () => {
  test("each registered id builds a valid scenario", async () => {
    for (const id of NEGOTIATION_SCENARIO_IDS) {
      const s = await getNegotiationScenario(id);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.parties.length).toBeGreaterThanOrEqual(2);
      for (const p of s.parties) {
        expect(p.staticInstructions.join("\n").length).toBeGreaterThan(0);
      }
    }
  });

  test("getNegotiationScenario rejects unknown id", async () => {
    await expect(getNegotiationScenario("nope")).rejects.toThrow(/Unknown negotiation scenario/);
  });
});
