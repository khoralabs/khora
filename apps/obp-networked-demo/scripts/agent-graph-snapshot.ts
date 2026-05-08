import { portExpiredForSnapshot } from "@cfd/obp-agent-runtime";
import type { GraphSnapshot, OBPPersistenceClient } from "@cfd/obp-core";
import type { FakeObpPersistence } from "@cfd/obp-core/testing";

export type { GraphSnapshot };

/** Same shape as runtime/examples/shared/graph-snapshot.ts — drives negotiation prompts over HTTP. */
export function buildAgentDemoGraphSnapshot(
  fake: FakeObpPersistence,
  client: OBPPersistenceClient,
  ledgerSeq: number,
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
      expiresSeq: o.expires_seq,
      expired: ledgerSeq >= o.expires_seq,
    };
  });
  const ports = [...fake.ports.values()].map((p) => ({
    id: p.id,
    type: p.type,
    promise: p.promise,
    terminal: p.terminal,
    maxBindings: p.max_bindings,
    ref: p.ref,
    bindCount: bindCountByPort.get(p.id) ?? 0,
    expiresSeq: p.expires_seq,
    expired: portExpiredForSnapshot({
      ledgerSeq,
      expiresSeq: p.expires_seq,
      ttlBasis: p.ttl_basis,
      ttlMeasure: p.ttl_measure,
      exposeSeq: p.expose_seq,
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
    ...(b.content_receipts !== undefined ? { content_receipts: b.content_receipts } : {}),
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
