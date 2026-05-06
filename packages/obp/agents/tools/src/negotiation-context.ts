import type { OBPPersistenceClient, ObpPersistence } from "@cfd/obp-core";
import { listBindableCounterpartyPorts } from "./bindable-counterparty-ports.ts";
import type { ObpNegotiationToolContext, ObpToolkitEnv } from "./obp-toolkit-env.ts";

export type {
  ObpNegotiationBindChoice,
  ObpNegotiationRevokeOfferChoice,
  ObpNegotiationRevokePortChoice,
  ObpNegotiationToolContext,
} from "./obp-toolkit-env.ts";

function toolNameBind(portId: string): string {
  return `obp_bind__${portId}`;
}

function toolNameRevokePort(portId: string): string {
  return `obp_revoke_port__${portId}`;
}

function toolNameRevokeOffer(offerId: string): string {
  return `obp_revoke_offer__${offerId}`;
}

function offerHasAnyBind(
  binds: ReadonlyArray<{ offerId: string; portId: string }>,
  offerId: string,
): boolean {
  return binds.some((b) => b.offerId === offerId);
}

function offerPortHasBind(
  binds: ReadonlyArray<{ offerId: string; portId: string }>,
  offerId: string,
  portId: string,
): boolean {
  return binds.some((b) => b.offerId === offerId && b.portId === portId);
}

/**
 * When {@link ToolPipelineHooks.onToolExecuted} fires for a successful {@code obp_end_negotiation},
 * mirror the outcome into {@code out} (same side effect as {@link ObpToolkitEnv.requestNegotiationEnd}).
 */
export function captureNegotiationEndFromToolExecuted(
  ev: { ok: boolean; toolName: string; input: unknown },
  out: { current: { reason?: string } | null },
): void {
  if (!ev.ok || ev.toolName !== "obp_end_negotiation") {
    return;
  }
  const reason = (ev.input as { reason?: string } | undefined)?.reason;
  out.current = { reason };
}

/**
 * Host fills this each turn from the live graph + session policy. Skips edges that fail structural bind checks;
 * runs optional `validateBind` (session policy) and drops choices that throw.
 */
export async function computeNegotiationContext(args: {
  client: OBPPersistenceClient;
  persistence: ObpPersistence;
  actingPartyId: string;
  ledgerSeq: number;
  validateBind?: ObpToolkitEnv["validateBind"];
}): Promise<ObpNegotiationToolContext> {
  const { client, persistence, actingPartyId, ledgerSeq, validateBind } = args;
  const bindChoices: ObpNegotiationToolContext["bindChoices"] = [];
  const revokePortChoices: ObpNegotiationToolContext["revokePortChoices"] = [];
  const revokeOfferIds = new Set<string>();

  const edges = client.listExposedPortEdges();
  const binds = persistence.listBinds();

  const bindable = await listBindableCounterpartyPorts({
    client,
    persistence,
    actingPartyId,
    ledgerSeq,
    validateBind,
  });
  for (const { offerId, portId } of bindable) {
    const offerRes = client.getOffer(offerId);
    const portRes = client.getPort(portId);
    if (offerRes.kind === "notFound" || portRes.kind === "notFound") {
      continue;
    }
    const offer = offerRes.offer;
    const port = portRes.port;
    bindChoices.push({
      toolName: toolNameBind(portId),
      description: `Bind to this port on the counterparty's offer. Offer: "${offer.type}"; port: "${port.type}" (terminal=${port.terminal}).`,
      offerId,
      portId,
    });
  }

  for (const { offerId, portId } of edges) {
    const owner = client.getExtendingPartyId(offerId);
    const offerRes = client.getOffer(offerId);
    const portRes = client.getPort(portId);
    if (offerRes.kind === "notFound" || portRes.kind === "notFound" || owner === null) {
      continue;
    }
    const offer = offerRes.offer;
    const port = portRes.port;

    if (owner === actingPartyId) {
      if (offerPortHasBind(binds, offerId, portId)) {
        continue;
      }
      revokePortChoices.push({
        toolName: toolNameRevokePort(portId),
        description: `Expire (revoke) your exposed port now. Offer: "${offer.type}"; port: "${port.type}" (terminal=${port.terminal}).`,
        offerId,
        portId,
      });
      revokeOfferIds.add(offerId);
    }
  }

  const revokeOfferChoices: ObpNegotiationToolContext["revokeOfferChoices"] = [];
  for (const offerId of revokeOfferIds) {
    if (offerHasAnyBind(binds, offerId)) {
      continue;
    }
    const o = client.getOffer(offerId);
    if (o.kind === "notFound") {
      continue;
    }
    revokeOfferChoices.push({
      toolName: toolNameRevokeOffer(offerId),
      description: `Expire (revoke) the whole offer "${o.offer.type}" now, including all its exposed ports.`,
      offerId,
    });
  }

  return { bindChoices, revokePortChoices, revokeOfferChoices };
}

/** True if this tool name corresponds to a successful graph bind (for session hooks / logging). */
export function isDynamicBindToolName(toolName: string): boolean {
  return toolName.startsWith("obp_bind__");
}
