import type { ErrorObject } from "ajv";

/** Format AJV validation errors for logs / agent-facing messages. */
export function formatAjvErrorsForAgent(errors: ErrorObject[] | null | undefined): string {
  if (errors === undefined || errors === null || errors.length === 0) {
    return "Validation failed";
  }
  return errors
    .map((e) => {
      const loc = e.instancePath === "" ? "(root)" : e.instancePath;
      const msg = e.message ?? "invalid";
      const kw = e.keyword ? ` [${e.keyword}]` : "";
      return `${loc}: ${msg}${kw}`;
    })
    .join("\n");
}
