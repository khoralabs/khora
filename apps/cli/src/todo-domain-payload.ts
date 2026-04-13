import z from "zod";

/** CLI todo command: domain shape passed into {@link MemoryAdapterClient.expand}. */
export const zTodoDomainPayload = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  due: z.string().optional(),
  status: z.enum(["open", "done", "cancelled"]).optional(),
});

export type TodoDomainPayload = z.infer<typeof zTodoDomainPayload>;
