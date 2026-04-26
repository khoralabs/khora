import { z } from "zod";
import { zRunId } from "./ids.ts";

export const zCalendarHoldStatus = z.enum(["tentative", "confirmed", "cancelled"] as const);
export type CalendarHoldStatus = z.infer<typeof zCalendarHoldStatus>;

export const zCalendarHold = z.object({
  id: z.string().min(1),
  subjectId: z.string().min(1),
  inviteId: zRunId.nullable(),
  bookingId: z.string().nullable(),
  startAt: z.number().int(),
  endAt: z.number().int(),
  timeZone: z.string(),
  status: zCalendarHoldStatus,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type CalendarHold = z.infer<typeof zCalendarHold>;
