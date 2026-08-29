import z from "zod";

/** Published host metadata. HTTP binding: GET /.well-known/khora */
export const zKhoraHostDiscoveryPopulation = z.object({
  current: z.number().int().nonnegative(),
  limit: z.number().int().positive().optional(),
});

export type KhoraHostDiscoveryPopulation = z.infer<typeof zKhoraHostDiscoveryPopulation>;

export const zKhoraHostDiscovery = z.object({
  version: z.literal(1),
  baseUrl: z.string().url(),
  endpoints: z.object({
    health: z.string(),
    ready: z.string(),
    register: z.string(),
  }),
  population: zKhoraHostDiscoveryPopulation,
  slug: z.string().optional(),
  registryUrl: z.string().url().optional(),
});

export type KhoraHostDiscovery = z.infer<typeof zKhoraHostDiscovery>;
