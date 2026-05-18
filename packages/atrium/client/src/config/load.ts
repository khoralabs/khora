import type z from "zod";
import { At2ConfigError } from "./errors.ts";
import { readAt2ConfigFileWithExtends } from "./file.ts";
import { mergeAt2AppConfigLayers } from "./merge.ts";

export type LoadAt2AppConfigOptions<TSchema extends z.ZodTypeAny> = {
  /** Host's extended schema. Use `extendAt2AppConfig({...})` or pass `zAt2AppConfigBase`. */
  schema: TSchema;
  /** Lower-priority layers (e.g. env). Merged left-to-right; file (when present) sits on top. */
  layers?: ReadonlyArray<unknown>;
  /**
   * Entry file path:
   *  - `undefined`: caller is expected to have pre-resolved with `resolveAt2ConfigPath`; pass
   *    the resolved path (or `null` for none).
   *  - `null`: file loading is disabled entirely.
   *  - `string`: read this file (with extends chain).
   */
  filePath?: string | null;
  /**
   * If `true`, treat ENOENT on `filePath` as fatal. Default `true` (assumes the caller picked the
   * path explicitly). Pass `false` for auto-discovered default paths.
   */
  filePathExplicit?: boolean;
  fs?: { readFileSync: (p: string) => string };
};

export type LoadedAt2AppConfig<TSchema extends z.ZodTypeAny> = {
  config: z.infer<TSchema>;
  sourcePath: string | undefined;
  extendsChain: string[];
};

/**
 * Layered, schema-validated config loader.
 *
 * Merge order (left = lowest priority):
 *   `[...layers, fileContents]` → validate via `schema` → return frozen result.
 *
 * The validated result has `extends` and `$schema` stripped.
 */
export function loadAt2AppConfig<TSchema extends z.ZodTypeAny>(
  opts: LoadAt2AppConfigOptions<TSchema>,
): LoadedAt2AppConfig<TSchema> {
  let fileMerged: Record<string, unknown> | undefined;
  let sourcePath: string | undefined;
  let extendsChain: string[] = [];
  if (typeof opts.filePath === "string") {
    const fileRead = readAt2ConfigFileWithExtends(opts.filePath, {
      explicit: opts.filePathExplicit ?? true,
      fs: opts.fs,
    });
    if (fileRead !== undefined) {
      fileMerged = fileRead.merged;
      sourcePath = fileRead.chain[fileRead.chain.length - 1];
      extendsChain = fileRead.chain;
    }
  }
  const allLayers: unknown[] = [...(opts.layers ?? [])];
  if (fileMerged !== undefined) allLayers.push(fileMerged);
  const merged = mergeAt2AppConfigLayers(allLayers);
  const result = opts.schema.safeParse(merged);
  if (!result.success) {
    throw new At2ConfigError(result.error.issues, sourcePath);
  }
  const parsed = result.data as Record<string, unknown>;
  delete parsed.extends;
  delete parsed.$schema;
  return {
    config: Object.freeze(parsed) as z.infer<TSchema>,
    sourcePath,
    extendsChain,
  };
}
