import type { ObpClient } from "@cfd/obp-core";
import { type BindableCounterpartyPort, newestOfferIdAmongBindable } from "@cfd/obp-tools";
import {
  noopPortIdForHeadOffer,
  OBP_AGENT_RUNTIME_NOOP_PORT_DESCRIPTION,
  OBP_AGENT_RUNTIME_NOOP_PORT_TYPE,
  OBP_AGENT_RUNTIME_WALK_AWAY_PORT_DESCRIPTION,
  OBP_AGENT_RUNTIME_WALK_AWAY_PORT_TYPE,
  walkAwayPortIdForHeadOffer,
} from "./constants.ts";
import { tsExpiredForTtl } from "./ttl-resolve.ts";
import type { TtlSpec } from "./ttl-spec.ts";

export function isPortExposedOnOffer(client: ObpClient, offerId: string, portId: string): boolean {
  return client.listExposedPortEdges().some((e) => e.offerId === offerId && e.portId === portId);
}

/** Newest counterparty offer that has any exposed port (even if not structurally bindable). */
export function newestCounterpartyExposedOfferId(args: {
  client: ObpClient;
  actingPartyId: string;
}): string | null {
  let best: { offerId: string; ts: number } | null = null;
  for (const { offerId } of args.client.listExposedPortEdges()) {
    const owner = args.client.getExtendingPartyId(offerId);
    if (owner === null || owner === args.actingPartyId) {
      continue;
    }
    const r = args.client.getOffer(offerId);
    if (r.kind === "notFound") {
      continue;
    }
    const ts = r.offer.ts_created;
    if (best === null || ts > best.ts) {
      best = { offerId, ts };
    }
  }
  return best?.offerId ?? null;
}

export function resolveHeadOfferIdForSyntheticPorts(args: {
  client: ObpClient;
  actingPartyId: string;
  bindable: ReadonlyArray<BindableCounterpartyPort>;
}): string | null {
  const fromBindable = newestOfferIdAmongBindable(args.client, args.bindable);
  if (fromBindable !== null) {
    return fromBindable;
  }
  return newestCounterpartyExposedOfferId({
    client: args.client,
    actingPartyId: args.actingPartyId,
  });
}

export type EnsureRuntimeSyntheticPortsArgs = {
  client: ObpClient;
  now: number;
  headOfferId: string;
  requireNoop: boolean;
  requireWalkAway: boolean;
  /** Negotiation turn index when these ports are logically introduced (audit `turnIndex`). */
  exposeTurnIndex: number;
  portTtl: TtlSpec;
};

/** Ensures synthetic noop / walk-away ports exist on the given offer (idempotent per offer + port id). */
export function ensureRuntimeSyntheticPorts(args: EnsureRuntimeSyntheticPortsArgs): string[] {
  const tsExp = tsExpiredForTtl(args.now, args.portTtl);
  const noopId = noopPortIdForHeadOffer(args.headOfferId);
  const walkId = walkAwayPortIdForHeadOffer(args.headOfferId);
  const ttlMeta = {
    ttl_basis: args.portTtl.basis,
    ttl_measure: args.portTtl.measure,
    expose_turn_index: args.exposeTurnIndex,
  } as const;

  const ensured: string[] = [];

  if (args.requireNoop && !isPortExposedOnOffer(args.client, args.headOfferId, noopId)) {
    args.client.exposePort({
      offerId: args.headOfferId,
      port: {
        id: noopId,
        ts_created: args.now,
        ts_expired: tsExp,
        type: OBP_AGENT_RUNTIME_NOOP_PORT_TYPE,
        description: OBP_AGENT_RUNTIME_NOOP_PORT_DESCRIPTION,
        max_bindings: 100,
        terminal: false,
        ref: "",
        sourcemaps: [],
        ...ttlMeta,
      },
    });
    ensured.push(noopId);
  }

  if (args.requireWalkAway && !isPortExposedOnOffer(args.client, args.headOfferId, walkId)) {
    args.client.exposePort({
      offerId: args.headOfferId,
      port: {
        id: walkId,
        ts_created: args.now,
        ts_expired: tsExp,
        type: OBP_AGENT_RUNTIME_WALK_AWAY_PORT_TYPE,
        description: OBP_AGENT_RUNTIME_WALK_AWAY_PORT_DESCRIPTION,
        max_bindings: 100,
        terminal: true,
        ref: "",
        sourcemaps: [],
        ...ttlMeta,
      },
    });
    ensured.push(walkId);
  }

  return ensured;
}
