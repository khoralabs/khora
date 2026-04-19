import type { StandardSchemaV1 } from "@cfd/agent-identity";

/** Minimal schema for `{}` tool inputs. */
export function emptyObjectSchema(): StandardSchemaV1<Record<string, never>> {
  return {
    "~standard": {
      version: 1,
      vendor: "obp-negotiation-demo",
      types: {
        input: {} as Record<string, never>,
        output: {} as Record<string, never>,
      },
      validate: (v: unknown) =>
        typeof v === "object" && v !== null && Object.keys(v as object).length === 0
          ? { value: v as Record<string, never> }
          : { issues: [{ message: "expected {}" }] },
    },
  };
}
