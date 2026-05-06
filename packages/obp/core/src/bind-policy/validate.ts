import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ObpError } from "../persistence/client/errors.ts";
import type { Port } from "../model/types.ts";
import { formatStandardSchemaIssuesForAgent } from "./issue-format.ts";
import { counterpartyBindSchemaForProperties, portBindPolicySchema } from "./standard-schema.ts";

function isPolicyActive(port: Port): boolean {
  const p = port.bind_policy;
  return p !== undefined && p.properties.length > 0;
}

function isEmptyCounterpartyBind(raw: unknown): boolean {
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
 * Validates `counterparty_bind` against `port.bind_policy` when present.
 * Returns normalized plain object for persistence (parsed output).
 * @throws ObpError VALIDATION on mismatch.
 */
export function validateCounterpartyBindForPort(port: Port, raw: unknown): Record<string, unknown> {
  if (!isPolicyActive(port)) {
    if (!isEmptyCounterpartyBind(raw)) {
      throw new ObpError(
        "VALIDATION",
        "counterparty_bind must be omitted or empty when port has no bind_policy",
      );
    }
    return {};
  }

  const policyResult = expectSync(portBindPolicySchema["~standard"].validate(port.bind_policy));
  if (policyResult.issues) {
    throw new ObpError(
      "VALIDATION",
      `Invalid bind_policy on port:\n${formatStandardSchemaIssuesForAgent(policyResult.issues)}`,
    );
  }

  const compiled = counterpartyBindSchemaForProperties(policyResult.value.properties);
  const out = expectSync(compiled["~standard"].validate(raw));
  if (out.issues) {
    throw new ObpError(
      "VALIDATION",
      `counterparty_bind:\n${formatStandardSchemaIssuesForAgent(out.issues)}`,
    );
  }
  return out.value;
}
