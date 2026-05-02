import type { ObpClient, PortBindPolicy } from "@cfd/obp-core";
import type { FakeObpPersistence } from "@cfd/obp-core/testing";
import { portExpiredForSnapshot } from "../src/port-turn-ttl.ts";

/** JSON-safe DAG view for the negotiation demo (in-memory FakeObpPersistence only). */
export type GraphSnapshot = {
  parties: Array<{ id: string; name: string }>;
  offers: Array<{
    id: string;
    type: string;
    partyId: string | null;
    partyName: string | null;
    tsExpired: number;
    expired: boolean;
  }>;
  ports: Array<{
    id: string;
    type: string;
    description: string;
    terminal: boolean;
    maxBindings: number;
    ref: string;
    bindCount: number;
    tsExpired: number;
    expired: boolean;
    exposedOnOfferIds: string[];
    bind_policy?: PortBindPolicy;
  }>;
  extends: Array<{ partyId: string; offerId: string }>;
  exposes: Array<{ offerId: string; portId: string }>;
  binds: Array<{
    offerId: string;
    portId: string;
    counterparty_bind?: Record<string, unknown>;
    bind_policy_snapshot?: PortBindPolicy;
  }>;
};

export function buildGraphSnapshot(
  fake: FakeObpPersistence,
  client: ObpClient,
  nowMs: number,
  /** Completed negotiation turns (same as {@link NegotiationRuntime.turns}). */
  negotiationTurnsCompleted: number,
): GraphSnapshot {
  const partyById = new Map([...fake.parties.values()].map((p) => [p.id, p.name]));
  const bindsList = fake.listBinds();
  const bindCountByPort = new Map<string, number>();
  for (const b of bindsList) {
    bindCountByPort.set(b.portId, (bindCountByPort.get(b.portId) ?? 0) + 1);
  }
  const exposesList = client.listExposedPortEdges();
  const exposedOffersByPort = new Map<string, string[]>();
  for (const e of exposesList) {
    const list = exposedOffersByPort.get(e.portId) ?? [];
    list.push(e.offerId);
    exposedOffersByPort.set(e.portId, list);
  }

  const parties = [...fake.parties.values()].map((p) => ({ id: p.id, name: p.name }));
  const offers = [...fake.offers.values()].map((o) => {
    const partyId = client.getExtendingPartyId(o.id);
    return {
      id: o.id,
      type: o.type,
      partyId,
      partyName: partyId === null ? null : (partyById.get(partyId) ?? null),
      tsExpired: o.ts_expired,
      expired: nowMs >= o.ts_expired,
    };
  });
  const ports = [...fake.ports.values()].map((p) => ({
    id: p.id,
    type: p.type,
    description: p.description,
    terminal: p.terminal,
    maxBindings: p.max_bindings,
    ref: p.ref,
    bindCount: bindCountByPort.get(p.id) ?? 0,
    tsExpired: p.ts_expired,
    expired: portExpiredForSnapshot({
      nowMs,
      tsExpired: p.ts_expired,
      ttlBasis: p.ttl_basis,
      ttlMeasure: p.ttl_measure,
      exposeTurnIndex: p.expose_turn_index,
      negotiationTurnsCompleted,
    }),
    exposedOnOfferIds: [...(exposedOffersByPort.get(p.id) ?? [])],
    ...(p.bind_policy !== undefined ? { bind_policy: p.bind_policy } : {}),
  }));
  const extendsEdges = [...fake.offers.values()]
    .map((o) => {
      const partyId = client.getExtendingPartyId(o.id);
      return partyId === null ? null : { partyId, offerId: o.id };
    })
    .filter((e): e is { partyId: string; offerId: string } => e !== null);
  const exposes = client.listExposedPortEdges().map((e) => ({
    offerId: e.offerId,
    portId: e.portId,
  }));
  const binds = fake.listBinds().map((b) => ({
    offerId: b.offerId,
    portId: b.portId,
    ...(b.counterparty_bind !== undefined ? { counterparty_bind: b.counterparty_bind } : {}),
    ...(b.bind_policy_snapshot !== undefined
      ? { bind_policy_snapshot: b.bind_policy_snapshot }
      : {}),
  }));

  return {
    parties,
    offers,
    ports,
    extends: extendsEdges,
    exposes,
    binds,
  };
}
