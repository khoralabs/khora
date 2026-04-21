import { tool } from "@cfd/agent-identity";
import z from "zod";
import { executeObpBind } from "./bind-execution.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";

export const zObpBindPortInput = z
  .object({
    offerId: z.string().uuid(),
    portId: z.string().uuid(),
  })
  .strict();

export type ObpBindPortInput = z.infer<typeof zObpBindPortInput>;

export const obpBindPortTool = tool<
  "obp_bind_port",
  ObpBindPortInput,
  { offerId: string; portId: string; price: number | null },
  ObpToolkitEnv
>({
  name: "obp_bind_port",
  description:
    "BIND: commit via an exposed port on an offer (UUIDs). Prefer contextual obp_bind__* tools when available. Session policy may restrict who may bind.",
  inputSchema: zObpBindPortInput,
  handler: async (ctx, input) => {
    const parsed = zObpBindPortInput.parse(input);
    return executeObpBind(ctx.env, { offerId: parsed.offerId, portId: parsed.portId });
  },
});
