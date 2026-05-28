import z from "zod";
import { zKhoraAppConfigBase } from "./schema.ts";

/**
 * Generate the JSON Schema for {@link zKhoraAppConfigBase}. The committed `khora-config.schema.json`
 * artifact is produced from this same call (see `scripts/build-json-schema.ts`); editors point at the
 * on-disk file via `$schema`.
 */
export function at2ConfigJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(zKhoraAppConfigBase, {
    unrepresentable: "any",
    target: "draft-2020-12",
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...generated,
  };
}
