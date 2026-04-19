import { createIdentityLink } from "@cfd/agent-identity";
import type { DemoAgents } from "../agents/buildAgents.ts";
import { evaluateAgentToolkit } from "../agents/buildAgents.ts";
import type { DemoStack } from "../obp/demoPersistence.ts";
import { agentSourcemaps } from "../obp/sourcemaps.ts";
import type { TranscriptStep } from "./types.ts";

export async function runCollaborative(
  agents: DemoAgents,
  stack: DemoStack,
): Promise<TranscriptStep[]> {
  const steps: TranscriptStep[] = [];
  const { client, now } = stack;

  const buyerEval = await evaluateAgentToolkit(agents.buyer);
  const sellerEval = await evaluateAgentToolkit(agents.seller);

  const buyerLink = await createIdentityLink({
    agent: agents.buyer,
    enabledToolNames: Object.keys(buyerEval.evaluated.tools),
    nameToStaticHash: buyerEval.nameToStaticHash,
    tools: buyerEval.evaluated.tools,
  });
  const sellerLink = await createIdentityLink({
    agent: agents.seller,
    enabledToolNames: Object.keys(sellerEval.evaluated.tools),
    nameToStaticHash: sellerEval.nameToStaticHash,
    tools: sellerEval.evaluated.tools,
  });

  steps.push({
    kind: "info",
    label: "identity.buyer",
    data: {
      agentId: buyerLink.agentId,
      agentName: buyerLink.agentName,
      staticHash: buyerLink.staticHash,
      runtimeHash: buyerLink.runtimeHash,
    },
  });
  steps.push({
    kind: "info",
    label: "identity.seller",
    data: {
      agentId: sellerLink.agentId,
      agentName: sellerLink.agentName,
      staticHash: sellerLink.staticHash,
      runtimeHash: sellerLink.runtimeHash,
    },
  });

  const t = now();
  const { party: buyerParty } = client.registerParty({
    name: agents.buyer.name,
    sourcemaps: agentSourcemaps(agents.buyer),
  });
  steps.push({
    kind: "obp",
    op: "registerParty",
    ok: true,
    detail: { role: "buyer", partyId: buyerParty.id, name: buyerParty.name },
  });

  const { party: sellerParty } = client.registerParty({
    name: agents.seller.name,
    sourcemaps: agentSourcemaps(agents.seller),
  });
  steps.push({
    kind: "obp",
    op: "registerParty",
    ok: true,
    detail: { role: "seller", partyId: sellerParty.id, name: sellerParty.name },
  });

  const { offer } = client.extendOffer({
    partyId: sellerParty.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: t,
      ts_expired: t + 86_400_000,
      type: "collab.api.v1",
      sourcemaps: [],
    },
  });
  steps.push({
    kind: "obp",
    op: "extendOffer",
    ok: true,
    detail: { offerId: offer.id, type: offer.type, partyId: sellerParty.id },
  });

  const { port } = client.exposePort({
    offerId: offer.id,
    port: {
      id: "",
      ts_created: t,
      ts_expired: t + 86_400_000,
      type: "collab.port.commitment",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  steps.push({
    kind: "obp",
    op: "exposePort",
    ok: true,
    detail: { portId: port.id, offerId: offer.id, max_bindings: port.max_bindings },
  });

  client.bindPort({ offerId: offer.id, portId: port.id });
  steps.push({
    kind: "obp",
    op: "bindPort",
    ok: true,
    detail: { offerId: offer.id, portId: port.id, actor: "buyer" },
  });

  return steps;
}
