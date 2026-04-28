import type { AnyComposable } from "@cfd/agent-identity";
import { dynamicToolkit, tool } from "@cfd/agent-identity";
import z from "zod";
import { executeObpBind } from "./bind-execution.ts";
import type {
  ObpNegotiationBindChoice,
  ObpNegotiationRevokeOfferChoice,
  ObpNegotiationRevokePortChoice,
  ObpToolkitEnv,
} from "./obp-toolkit-env.ts";

const zEmpty = z.object({}).strict();

function buildDynamicMembers(env: ObpToolkitEnv): AnyComposable<ObpToolkitEnv>[] {
  const nc = env.negotiationToolContext;
  if (nc === undefined) {
    return [];
  }
  const members: AnyComposable<ObpToolkitEnv>[] = [];

  const pushBind = (b: ObpNegotiationBindChoice) => {
    members.push(
      tool({
        name: b.toolName,
        description: b.description,
        inputSchema: zEmpty,
        handler: async (ctx) => {
          return executeObpBind(ctx.env, { offerId: b.offerId, portId: b.portId });
        },
      }) as AnyComposable<ObpToolkitEnv>,
    );
  };

  const pushRevokePort = (r: ObpNegotiationRevokePortChoice) => {
    members.push(
      tool({
        name: r.toolName,
        description: r.description,
        inputSchema: zEmpty,
        handler: async (ctx) => {
          const e = ctx.env;
          if (e.client.getExtendingPartyId(r.offerId) !== e.actingPartyId) {
            throw new Error("obp_revoke_port: not authorized for this offer");
          }
          e.client.expirePortNow(r.portId);
          return { revoked: "port" as const, portId: r.portId };
        },
      }) as AnyComposable<ObpToolkitEnv>,
    );
  };

  const pushRevokeOffer = (r: ObpNegotiationRevokeOfferChoice) => {
    members.push(
      tool({
        name: r.toolName,
        description: r.description,
        inputSchema: zEmpty,
        handler: async (ctx) => {
          const e = ctx.env;
          if (e.client.getExtendingPartyId(r.offerId) !== e.actingPartyId) {
            throw new Error("obp_revoke_offer: not authorized for this offer");
          }
          e.client.expireOfferNow(r.offerId);
          return { revoked: "offer" as const, offerId: r.offerId };
        },
      }) as AnyComposable<ObpToolkitEnv>,
    );
  };

  for (const b of nc.bindChoices) {
    pushBind(b);
  }
  for (const r of nc.revokePortChoices) {
    pushRevokePort(r);
  }
  for (const r of nc.revokeOfferChoices) {
    pushRevokeOffer(r);
  }

  return members;
}

/**
 * Per-turn bind/revoke tools from {@link ObpToolkitEnv.negotiationToolContext}.
 */
export const obpNegotiationDynamicToolkit = dynamicToolkit<
  "obp-negotiation-dynamic",
  ObpToolkitEnv
>({
  name: "obp-negotiation-dynamic",
  instructions: [
    "Contextual tools whose names start with obp_bind__ / obp_revoke_port__ / obp_revoke_offer__: use these for concrete commitments or to expire your own offers/ports. Descriptions identify each option.",
  ],
  create: async (ctx) => buildDynamicMembers(ctx.env as ObpToolkitEnv),
});
