import { z } from "zod";
import { zRunId } from "./ids.ts";

/**
 * OBP / session outcome for an invite. Not a calendar slot (see calendar-hold).
 * `result` mirrors `MatchmakingResult` JSON.
 */
export const zBooking = z.object({
  id: z.string().min(1),
  inviteId: zRunId,
  result: z.unknown(),
  createdAt: z.number().int(),
});
export type Booking = z.infer<typeof zBooking>;
