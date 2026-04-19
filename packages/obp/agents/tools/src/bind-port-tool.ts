import { tool } from "@cfd/agent-identity";
import { ObpError } from "@cfd/obp-core";
import z from "zod";
import { parsePriceFromType } from "./encoding.ts";
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
    "BIND: commit via a terminal port on an offer. Target offer and port ids from the graph; domain rules may restrict which party may bind (see session policy).",
  inputSchema: zObpBindPortInput,
  handler: async (ctx, input) => {
    const parsed = zObpBindPortInput.parse(input);
    const env = ctx.env;
    const offerOwnerPartyId = env.client.getExtendingPartyId(parsed.offerId);
    const portRes = env.client.getPort(parsed.portId);
    if (portRes.kind === "notFound") {
      throw new Error("obp_bind_port: port not found");
    }
    const port = portRes.port;
    if (!port.terminal) {
      throw new Error("obp_bind_port: port must be terminal");
    }
    const price = parsePriceFromType(port.type);
    if (env.validateBind) {
      await env.validateBind({
        actingPartyId: env.actingPartyId,
        offerId: parsed.offerId,
        portId: parsed.portId,
        offerOwnerPartyId,
        port,
        price,
      });
    }
    try {
      env.client.bindPort({ offerId: parsed.offerId, portId: parsed.portId });
    } catch (e) {
      if (e instanceof ObpError) {
        throw new Error(`${e.code}: ${e.message}`);
      }
      throw e;
    }
    return { offerId: parsed.offerId, portId: parsed.portId, price };
  },
});
