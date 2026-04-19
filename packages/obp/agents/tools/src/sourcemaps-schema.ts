import z from "zod";

const zSourceMapRef = z
  .object({
    resource_id: z.string().min(1).max(500),
    source_key: z.string().min(1).max(500),
  })
  .strict();

/** Optional provenance links; omit in normal agent turns. */
export const zOptionalSourcemaps = z.array(zSourceMapRef).max(32).optional();
