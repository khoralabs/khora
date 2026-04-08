import type { StandardSchemaV1 } from "../src/standard-schema.ts";

/** Minimal Standard Schema v1 object for examples (no external schema lib). */
export function numberInputSchema(): StandardSchemaV1<number> {
  return {
    "~standard": {
      version: 1,
      vendor: "agent-identity-example",
      types: { input: 0 as number, output: 0 as number },
      validate: (value) => {
        if (typeof value === "number" && Number.isFinite(value)) {
          return { value };
        }
        return { issues: [{ message: "Expected a finite number" }] };
      },
    },
  };
}

export function greetInputSchema(): StandardSchemaV1<{ name: string }> {
  return {
    "~standard": {
      version: 1,
      vendor: "agent-identity-example",
      types: {
        input: {} as { name: string },
        output: {} as { name: string },
      },
      validate: (value) => {
        if (
          typeof value === "object" &&
          value !== null &&
          "name" in value &&
          typeof (value as { name: unknown }).name === "string"
        ) {
          return { value: value as { name: string } };
        }
        return { issues: [{ message: "Expected { name: string }" }] };
      },
    },
  };
}
