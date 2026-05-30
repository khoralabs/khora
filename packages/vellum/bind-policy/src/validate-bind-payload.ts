import { ObpError } from "@khoralabs/obp-v2-errors";
import type { JsonDocument } from "@khoralabs/obp-v2-model";

import { assertBindPolicyJsonSchema, getBindPayloadValidator } from "./ajv-compile-bind-schema";
import { formatAjvErrorsForAgent } from "./format-ajv-errors";

function policyIsActive(bindPolicy: JsonDocument | null): boolean {
  return (
    bindPolicy !== null &&
    typeof bindPolicy === "object" &&
    !Array.isArray(bindPolicy) &&
    Object.keys(bindPolicy as object).length > 0
  );
}

function isEmptyBindPayload(raw: unknown): boolean {
  if (raw === undefined || raw === null) {
    return true;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return Object.keys(raw as object).length === 0;
}

/**
 * Validates **`bind_payload`** against **`bind_policy`** when the policy is present and non-empty.
 * **`bind_policy`** MUST be a JSON Schema (draft 2020-12) with root **`type`: `"object"`**.
 * Returns a normalized plain JSON object for persistence.
 * @throws {ObpError} **`VALIDATION`** on mismatch or invalid schema.
 */
export function validateVellumBindPayloadForPort(
  bindPolicy: JsonDocument | null,
  raw: unknown,
): Record<string, unknown> {
  if (!policyIsActive(bindPolicy)) {
    if (!isEmptyBindPayload(raw)) {
      throw new ObpError(
        "VALIDATION",
        "bind_payload must be omitted or empty when port has no bind_policy",
      );
    }
    return {};
  }

  assertBindPolicyJsonSchema(bindPolicy);
  const validate = getBindPayloadValidator(bindPolicy);

  if (!validate(raw)) {
    throw new ObpError("VALIDATION", `bind_payload:\n${formatAjvErrorsForAgent(validate.errors)}`);
  }

  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
}
