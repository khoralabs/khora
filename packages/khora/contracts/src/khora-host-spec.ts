import z from "zod";

/** Persisted host identity + registry connection (catalog projection `khora:host-spec`). */
export const zKhoraHostSpec = z.object({
  registryUrl: z.string().optional(),
  slug: z.string().optional(),
  publicBaseUrl: z.string().optional(),
  displayName: z.string().optional(),
  registrationSecret: z.string().optional(),
  managementToken: z.string().optional(),
  updatedAtMs: z.number().optional(),
});

export type KhoraHostSpec = z.infer<typeof zKhoraHostSpec>;

/** Admin PATCH for connection fields only (secrets use dedicated store methods). */
export const zKhoraHostSpecPatch = z.object({
  registryUrl: z.string().optional(),
  slug: z.string().optional(),
  publicBaseUrl: z.string().optional(),
  displayName: z.string().optional(),
});

export type KhoraHostSpecPatch = z.infer<typeof zKhoraHostSpecPatch>;

export type EffectiveKhoraHostSpec = {
  registryUrl: string;
  slug: string | undefined;
  publicBaseUrl: string;
  displayName: string | undefined;
  registrationSecret: string | undefined;
  managementToken: string | undefined;
};
