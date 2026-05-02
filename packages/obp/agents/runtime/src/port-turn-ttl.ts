import type { ObpClient } from "@cfd/obp-core";

/** Smallest recorded **`expose_seq`** among ports on an offer (for synthetic port alignment). */
export function minExposeSeqOnOffer(client: ObpClient, offerId: string): number | undefined {
  let minV: number | undefined;
  for (const e of client.listExposedPortEdges()) {
    if (e.offerId !== offerId) {
      continue;
    }
    const pr = client.getPort(e.portId);
    if (pr.kind !== "found") {
      continue;
    }
    const ix = pr.port.expose_seq;
    if (typeof ix === "number") {
      minV = minV === undefined ? ix : Math.min(minV, ix);
    }
  }
  return minV;
}

/** Bind-menu eligibility for ports exposed with negotiation turn-based TTL. */
export function filterPortIdsByNegotiationTurnTtl(
  client: ObpClient,
  portIds: readonly string[],
  turnsCompleted: number,
): string[] {
  return portIds.filter((id) => portEligibleForBindAtTurn(client, id, turnsCompleted));
}

export function portEligibleForBindAtTurn(
  client: ObpClient,
  portId: string,
  turnsCompleted: number,
): boolean {
  const pr = client.getPort(portId);
  if (pr.kind !== "found") {
    return false;
  }
  const p = pr.port;
  if (p.ttl_basis !== "turns") {
    return true;
  }
  if (
    p.expose_seq === undefined ||
    p.ttl_measure === undefined ||
    p.expose_seq === null ||
    p.ttl_measure === null
  ) {
    return true;
  }
  return turnsCompleted <= p.expose_seq + p.ttl_measure;
}

/** DAG **`expired`** flag: ledger sequence cap and optional turn-TTL (when metadata present). */
export function portExpiredForSnapshot(args: {
  ledgerSeq: number;
  expiresSeq: number;
  ttlBasis?: string;
  ttlMeasure?: number;
  exposeSeq?: number;
  negotiationTurnsCompleted: number;
}): boolean {
  const seqExpired = args.ledgerSeq >= args.expiresSeq;
  if (args.ttlBasis !== "turns" || args.exposeSeq === undefined || args.ttlMeasure === undefined) {
    return seqExpired;
  }
  const turnExpired = args.negotiationTurnsCompleted > args.exposeSeq + args.ttlMeasure;
  return seqExpired || turnExpired;
}
