import type { ObpClient } from "@cfd/obp-core";

/** Smallest recorded `expose_turn_index` among ports on an offer (for synthetic port alignment). */
export function minExposeTurnIndexOnOffer(client: ObpClient, offerId: string): number | undefined {
  let minV: number | undefined;
  for (const e of client.listExposedPortEdges()) {
    if (e.offerId !== offerId) {
      continue;
    }
    const pr = client.getPort(e.portId);
    if (pr.kind !== "found") {
      continue;
    }
    const ix = pr.port.expose_turn_index;
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
    p.expose_turn_index === undefined ||
    p.ttl_measure === undefined ||
    p.expose_turn_index === null ||
    p.ttl_measure === null
  ) {
    return true;
  }
  return turnsCompleted <= p.expose_turn_index + p.ttl_measure;
}

/** DAG `expired` flag: wall-clock or turn-TTL (when metadata present). */
export function portExpiredForSnapshot(args: {
  nowMs: number;
  tsExpired: number;
  ttlBasis?: string;
  ttlMeasure?: number;
  exposeTurnIndex?: number;
  negotiationTurnsCompleted: number;
}): boolean {
  const clockExpired = args.nowMs >= args.tsExpired;
  if (
    args.ttlBasis !== "turns" ||
    args.exposeTurnIndex === undefined ||
    args.ttlMeasure === undefined
  ) {
    return clockExpired;
  }
  const turnExpired = args.negotiationTurnsCompleted > args.exposeTurnIndex + args.ttlMeasure;
  return clockExpired || turnExpired;
}
