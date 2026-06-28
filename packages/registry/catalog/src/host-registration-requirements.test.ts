import { describe, expect, test } from "bun:test";
import {
  allAutoActivateRequirementsMet,
  initializeRegistrationRequirements,
  readRegistrationPolicyFromEnv,
  registrationPolicyForTrustLevel,
  updateRegistrationRequirement,
} from "./host-registration-requirements";

describe("host registration requirements", () => {
  test("manual policy requires operator approval and never auto activates", async () => {
    const policy = registrationPolicyForTrustLevel("manual");
    const states = initializeRegistrationRequirements(policy);
    expect(states.some((item) => item.id === "operator_approval")).toBe(true);
    expect(allAutoActivateRequirementsMet(states, policy)).toBe(false);
  });

  test("health policy auto activates when health check satisfied", async () => {
    const policy = registrationPolicyForTrustLevel("health");
    let states = initializeRegistrationRequirements(policy);
    expect(allAutoActivateRequirementsMet(states, policy)).toBe(false);
    states = updateRegistrationRequirement(states, "health_check", {
      status: "satisfied",
    });
    expect(allAutoActivateRequirementsMet(states, policy)).toBe(true);
  });

  test("readRegistrationPolicyFromEnv defaults to manual", async () => {
    const policy = readRegistrationPolicyFromEnv({});
    expect(policy.trustLevel).toBe("manual");
  });
});
