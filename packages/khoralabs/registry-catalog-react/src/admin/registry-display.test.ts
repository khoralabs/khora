import { describe, expect, test } from "bun:test";
import {
  healthCheckRequirementDetail,
  registrationRequirementsWithoutHealth,
} from "./registry-display";

describe("registry-display", () => {
  test("healthCheckRequirementDetail for up and down", () => {
    expect(healthCheckRequirementDetail({ status: "up", probedEndpoint: "ready" })).toBe(
      "Health probe OK (ready)",
    );
    expect(healthCheckRequirementDetail({ status: "down" })).toBe("Health probe failed");
  });

  test("registrationRequirementsWithoutHealth filters health_check", () => {
    const requirements = [
      { id: "health_check" as const, status: "pending" as const },
      { id: "operator_approval" as const, status: "satisfied" as const },
    ];
    const filtered = registrationRequirementsWithoutHealth(requirements);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("operator_approval");
  });
});
