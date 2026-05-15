import { ObpError } from "@khoralabs/obp-v2-errors";
import type { JsonDocument } from "@khoralabs/obp-v2-model";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { formatStandardSchemaIssuesForAgent } from "./bind-policy-issue-format.ts";
import { bindPayloadSchemaForProperties, portBindPolicySchema } from "./bind-policy-schema.ts";

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

function expectSync<T>(
  r: StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>,
): StandardSchemaV1.Result<T> {
  if (r instanceof Promise) {
    throw new TypeError("bind-policy validators must be synchronous");
  }
  return r;
}

/**
 * Vellum Standard Schema profile: validates **`bind_payload`** against **`bindPolicy`** when the policy is present and non-empty.
 * Returns normalized plain object for persistence (parsed output).
 * @throws {ObpError} **`VALIDATION`** on mismatch.
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

  const policyResult = expectSync(portBindPolicySchema["~standard"].validate(bindPolicy));
  if (policyResult.issues) {
    throw new ObpError(
      "VALIDATION",
      `Invalid bind_policy on port:\n${formatStandardSchemaIssuesForAgent(policyResult.issues)}`,
    );
  }

  const compiled = bindPayloadSchemaForProperties(policyResult.value.properties);
  const out = expectSync(compiled["~standard"].validate(raw));
  if (out.issues) {
    throw new ObpError(
      "VALIDATION",
      `bind_payload:\n${formatStandardSchemaIssuesForAgent(out.issues)}`,
    );
  }
  return out.value;
}

/** @deprecated Prefer {@link validateVellumBindPayloadForPort}; kept for incremental migration. */
export const validateBindPayloadForPort = validateVellumBindPayloadForPort;
