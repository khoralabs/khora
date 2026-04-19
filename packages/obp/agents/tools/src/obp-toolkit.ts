import { toolkit } from "@cfd/agent-identity";
import { obpBindPortTool } from "./bind-port-tool.ts";
import { obpExposePortTool } from "./expose-port-tool.ts";
import { obpExtendOfferTool } from "./extend-offer-tool.ts";

/**
 * Composable: extend offer, expose port, bind port — evaluate with {@link ObpToolkitEnv}.
 */
export const obpToolkit = toolkit([obpExtendOfferTool, obpExposePortTool, obpBindPortTool], {
  name: "obp-coordination",
  instructions: [
    "OBP coordinates parties through a persisted offer/port graph. Infer other parties only from rows in the snapshot you are given—never assume private goals or off-graph facts.",
    "obp_extend_offer: publish an offer from your party (offerType required). Expiry defaults to 24 hours (expiresAfterHours); ids and created time are system-assigned. For the multi-issue negotiation demo, encode counters as demo.negotiation.v2|p=<price>|s=<contract_months>|t=<url-encoded short message>. Price and term are both part of the public proposal.",
    "obp_expose_port: attach a port to an offer your party extends. max_bindings defaults to 1; port expiry defaults to 24 hours unless you set expiresAfterHours. Use non-terminal ports (terminal=false) for staging. For a final binding commitment, use terminal=true with portType demo.deal.v2|p=<price>|s=<contract_months> (both dimensions required).",
    "obp_bind_port: commit by binding an offer id to a terminal port id from the graph. In two-party negotiation, the buyer typically binds to the seller's offer and terminal deal port; session policy enforces acceptable price and term.",
    "To pass a turn without changing the graph, reply with text only and do not invoke tools (noop).",
    "Otherwise use tools when they advance coordination—at most a few tool calls per reply when appropriate.",
  ],
});

/** @deprecated Use {@link obpToolkit} */
export const obpNegotiationToolkit = obpToolkit;
