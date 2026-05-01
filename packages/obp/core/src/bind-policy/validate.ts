import { ObpError } from "../errors.ts";
import type { Port } from "../model/types.ts";
import { bindPolicyPropertiesToZod, zPortBindPolicy } from "./compile.ts";
import { formatZodErrorForAgent } from "./zod-error-format.ts";

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

/**
 * Validates `counterparty_bind` against `port.bind_policy` when present.
 * Returns normalized plain object for persistence (parsed output).
 * @throws ObpError VALIDATION on mismatch; NOT_FOUND if policy JSON is invalid on port.
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

  const policyParse = zPortBindPolicy.safeParse(port.bind_policy);
  if (!policyParse.success) {
    throw new ObpError(
      "VALIDATION",
      `Invalid bind_policy on port:\n${formatZodErrorForAgent(policyParse.error)}`,
    );
  }

  const props = policyParse.data.properties;
  const compiled = bindPolicyPropertiesToZod(props);
  const out = compiled.safeParse(raw);
  if (!out.success) {
    throw new ObpError("VALIDATION", `counterparty_bind:\n${formatZodErrorForAgent(out.error)}`);
  }
  return out.data as Record<string, unknown>;
}
