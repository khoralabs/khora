import { tool } from "@cfd/agent-identity";
import z from "zod";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

const zInput = z
  .object({
    reason: z.string().max(2000).optional(),
  })
  .strict();

export const obpEndNegotiationTool = tool<
  "obp_end_negotiation",
  z.infer<typeof zInput>,
  { ended: true },
  ObpToolkitEnv
>({
  name: "obp_end_negotiation",
  description:
    "End this negotiation session when you consider it complete (e.g. deal done, mutual agreement to stop, or walk-away). Prefer this over long closing prose once no further graph changes are needed.",
  inputSchema: zInput,
  handler: async (ctx, input) => {
    const fn = ctx.env.requestNegotiationEnd;
    if (fn === undefined) {
      throw new Error("obp_end_negotiation: not available in this session");
    }
    fn({ reason: input.reason });
    return { ended: true };
  },
});
