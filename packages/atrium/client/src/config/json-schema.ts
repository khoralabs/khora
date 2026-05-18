import z from "zod";
import { zAt2AppConfigBase } from "./schema.ts";

/**
 * Generate the JSON Schema for {@link zAt2AppConfigBase}. The committed `at2-config.schema.json`
 * artifact is produced from this same call (see `scripts/build-json-schema.ts`); editors point at the
 * on-disk file via `$schema`.
 */
export function at2ConfigJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(zAt2AppConfigBase, {
    unrepresentable: "any",
    target: "draft-2020-12",
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...generated,
  };
}
