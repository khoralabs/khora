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
    "obp_extend_offer: publish an offer (offerType required). offerType is an arbitrary public string—plain language, ad-hoc key=value, or any convention your scenario uses; the toolkit does not mandate a schema. Expiry defaults to 24 hours (expiresAfterHours); ids and created time are system-assigned.",
    "obp_expose_port: attach a port to an offer your party extends. portType is an arbitrary public string. For a final commitment surface, set terminal=true on the port the other party should bind.",
    "obp_bind_port: bind your party to a port on an offer; session policy may enforce role/party/terminal invariants only—no parsing of offerType/portType contents.",
    "To pass a turn without changing the graph, reply with text only and do not invoke tools (noop).",
    "Otherwise use tools when they advance coordination—at most a few tool calls per reply when appropriate.",
  ],
});

/** @deprecated Use {@link obpToolkit} */
export const obpNegotiationToolkit = obpToolkit;
