import { toolkit } from "@cfd/agent-identity";
import { obpEndNegotiationTool } from "./end-negotiation-tool.ts";
import { obpExposePortTool } from "./expose-port-tool.ts";
import { obpExtendOfferTool } from "./extend-offer-tool.ts";
import { obpNegotiationDynamicToolkit } from "./obp-negotiation-dynamic.ts";

/**
 * Unified OBP toolkit: extend, expose, end negotiation, plus contextual bind/revoke tools when `negotiationToolContext` is set on the tool env.
 */
export const obpToolkit = toolkit(
  [obpExtendOfferTool, obpExposePortTool, obpEndNegotiationTool, obpNegotiationDynamicToolkit],
  {
    name: "obp-coordination",
    instructions: [
      "OBP coordinates parties through a persisted offer/port graph. Infer other parties only from rows in the snapshot you are given—never assume private goals or off-graph facts.",
      "obp_extend_offer: publish an offer (offerType required). offerType is an arbitrary public string—plain language, ad-hoc key=value, or any convention your scenario uses; the toolkit does not mandate a schema. Expiry defaults to 24 hours (expiresAfterHours); ids and created time are system-assigned.",
      "obp_expose_port: attach a port to an offer your party extends. portType is an arbitrary public string. terminal is a semantic hint (commitment vs branch)—it does not change bind rules.",
      "Contextual tools (obp_bind__*, obp_revoke_port__*, obp_revoke_offer__*): appear when the host provides a negotiation context. Use obp_bind__* to commit to a specific counterparty port; use revoke_* to expire your own ports or offers now.",
      "obp_end_negotiation: call once when the negotiation is finished from your perspective (deal done, impasse, or no further graph moves). Prefer this over long closing monologues so the session can end cleanly.",
      "To pass a turn without changing the graph, reply with text only and do not invoke tools (noop).",
      "Otherwise use tools when they advance coordination—at most a few tool calls per reply when appropriate.",
      "Offer design pattern: expose ports that cover the action space you are prepared to engage with in response to your offer. Use terminal=true for a final commitment surface (accepting a proposal, declining). Use terminal=false for a port that opens a further branch of exchange (counter-proposal). The other party reads these port types from the graph snapshot and decides which to bind.",
    ],
  },
);

/** @deprecated Use {@link obpToolkit} */
export const obpNegotiationToolkit = obpToolkit;
