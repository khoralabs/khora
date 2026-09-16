import z from "zod";

export const zDeliveryReceiptSummary = z.object({
  jobId: z.string().min(1),
  postId: z.string().min(1),
  status: z.enum(["planning_pending", "planning", "routing_pending", "completed", "failed"]),
  plannedTargetCount: z.number().int().nonnegative(),
  routedTargetCount: z.number().int().nonnegative(),
  targetCount: z.number().int().nonnegative(),
  deliveredCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  receiptsAvailable: z.boolean(),
});
export type DeliveryReceiptSummary = z.infer<typeof zDeliveryReceiptSummary>;

export const zDeliveryReceiptContains = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    targeted: z.boolean(),
    status: z.enum(["delivered", "failed", "pending", "not-targeted", "not-pushed"]),
  }),
]);
export type DeliveryReceiptContains = z.infer<typeof zDeliveryReceiptContains>;

export const zDeliveryReceiptTargetsPage = z.discriminatedUnion("available", [
  z.object({ available: z.literal(false) }),
  z.object({
    available: z.literal(true),
    items: z.array(z.object({ ordinal: z.number().int().nonnegative(), did: z.string().min(1) })),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
]);
export type DeliveryReceiptTargetsPage = z.infer<typeof zDeliveryReceiptTargetsPage>;
