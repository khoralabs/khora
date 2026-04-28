import { z } from "zod";

export const zDomainEventName = z.enum([
  "ProfileUpserted",
  "InviteCreated",
  "InviteCompleted",
  "GoalsExtracted",
  "BookingRecorded",
  "CalendarHoldCreated",
  "CalendarHoldUpdated",
  "CalendarHoldCancelled",
  "ReflectionRecorded",
] as const);
export type DomainEventName = z.infer<typeof zDomainEventName>;

export const zDomainEvent = z.object({
  id: z.string().min(1),
  name: zDomainEventName,
  subjectId: z.string().min(1),
  aggregateId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.number().int(),
});
export type DomainEvent = z.infer<typeof zDomainEvent>;
