import type { JsonDocument } from "@khoralabs/obp-v2-model";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import { type NbcBindTiming, isRelayExpiryOk, isTurnExpiryOk } from "./nbc-invariants.ts";
import type {
  NbcChainExposeEdge,
  NbcChainExtendEdge,
  NbcChainGraph,
  NbcChainOfferRow,
  NbcChainPartyRow,
  NbcChainPortRow,
} from "./nbc-chain-graph-types.ts";

export type CollectNbcChainGraphOptions = {
  /** When set, **`expired`** flags use NBC N1 against this timing. */
  timing?: NbcBindTiming;
  /**
   * NBC expose/bind policy document per port (e.g. session-local policy), merged into **`bind_policy`** on port rows.
   * Terminal / caps may be supplied by the host via **`terminal`** / **`max_bindings`** on returned documents if encoded there;
   * otherwise leave overlays unset.
   */
  getBindPolicyForPort?: (portId: string) => JsonDocument | null | Promise<JsonDocument | null>;
};

function isNbcExpiryViewExpired(
  node: { readonly expires_turn: number; readonly expires_at_relay_ms: number },
  t: NbcBindTiming,
): boolean {
  return !(
    isTurnExpiryOk(node.expires_turn, t.turnSeq) && isRelayExpiryOk(node.expires_at_relay_ms, t.relayTsMs)
  );
}

export async function collectNbcChainGraph(
  client: ObpPersistenceClient,
  options: CollectNbcChainGraphOptions = {},
): Promise<NbcChainGraph> {
  const { timing, getBindPolicyForPort } = options;

  const [{ edges: exposedEdges }, { binds }, snapOut] = await Promise.all([
    client.listExposedPortEdges(),
    client.listBinds(),
    client.getPortsSnapshot(),
  ]);

  const exposes: NbcChainExposeEdge[] = exposedEdges.map((e) => ({
    offerId: e.offerId,
    portId: e.portId,
  }));

  const offerIds = new Set<string>();
  for (const e of exposes) offerIds.add(e.offerId);
  for (const b of binds) offerIds.add(b.offerId);

  const extendRows = await Promise.all(
    [...offerIds].map(async (offerId) => {
      const partyId = await client.getExtendingPartyId(offerId);
      if (partyId === null || partyId === "") return null;
      return { partyId, offerId } satisfies NbcChainExtendEdge;
    }),
  );
  const extendsEdges = extendRows.filter((x): x is NbcChainExtendEdge => x !== null);
  const partyIds = new Set(extendsEdges.map((e) => e.partyId));

  const partyRows = await Promise.all(
    [...partyIds].map(async (id) => {
      const { result } = await client.getParty({ id });
      if (result.kind === "party") {
        return { id: result.party.id, name: result.party.name } satisfies NbcChainPartyRow;
      }
      return { id, name: "—" } satisfies NbcChainPartyRow;
    }),
  );
  const parties = [...partyRows].sort((a, b) => a.id.localeCompare(b.id));

  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  const offerRows = await Promise.all(
    [...offerIds].map(async (offerId) => {
      const { result } = await client.getOffer({ id: offerId });
      if (result.kind !== "offer") return null;
      const o = result.offer;
      const win = await client.getNbcBindWindowForOfferOrNull(offerId);
      const expires_turn = win?.nbc_expires_turn ?? 0;
      const expires_at_relay_ms = win?.nbc_expires_at_relay_ms ?? 0;
      const ext = extendsEdges.find((e) => e.offerId === offerId);
      const partyId = ext?.partyId ?? "";
      const partyName = partyId ? partyNameById.get(partyId) : undefined;
      const expiryView = { expires_turn, expires_at_relay_ms };
      return {
        id: o.id,
        type: o.type,
        expires_turn,
        expires_at_relay_ms,
        sourcemaps: o.sourcemaps,
        partyId,
        partyName,
        ...(timing !== undefined ? { expired: isNbcExpiryViewExpired(expiryView, timing) } : {}),
      } satisfies NbcChainOfferRow;
    }),
  );
  const offers: NbcChainOfferRow[] = offerRows.filter((row) => row !== null);
  offers.sort((a, b) => a.id.localeCompare(b.id));

  const bindCountByPort = new Map<string, number>();
  for (const b of binds) {
    bindCountByPort.set(b.portId, (bindCountByPort.get(b.portId) ?? 0) + 1);
  }

  const exposedByPort = new Map<string, string[]>();
  for (const e of exposes) {
    const list = exposedByPort.get(e.portId) ?? [];
    list.push(e.offerId);
    exposedByPort.set(e.portId, list);
  }
  for (const [, list] of exposedByPort) {
    list.sort((a, b) => a.localeCompare(b));
  }

  const ports: NbcChainPortRow[] = await Promise.all(
    snapOut.entries.map(async ({ portId, port }) => {
      let bind_policy: JsonDocument | undefined;
      if (getBindPolicyForPort !== undefined) {
        const raw = await getBindPolicyForPort(portId);
        if (raw !== null && raw !== undefined) {
          bind_policy = raw;
        }
      }
      const win = await client.getNbcBindWindowForPortOrNull(portId);
      const expires_turn = win?.nbc_expires_turn ?? 0;
      const expires_at_relay_ms = win?.nbc_expires_at_relay_ms ?? 0;
      const expiryView = { expires_turn, expires_at_relay_ms };
      const row: NbcChainPortRow = {
        id: port.id,
        type: port.type,
        promise: port.promise,
        ref: port.ref,
        sourcemaps: port.sourcemaps,
        expires_turn,
        expires_at_relay_ms,
        exposedOnOfferIds: Object.freeze([...(exposedByPort.get(portId) ?? [])]),
        bindCount: bindCountByPort.get(portId) ?? 0,
        ...(timing !== undefined ? { expired: isNbcExpiryViewExpired(expiryView, timing) } : {}),
        bind_policy,
      };
      return row;
    }),
  );
  ports.sort((a, b) => a.id.localeCompare(b.id));

  extendsEdges.sort((a, b) => {
    const c = a.offerId.localeCompare(b.offerId);
    return c !== 0 ? c : a.partyId.localeCompare(b.partyId);
  });

  return {
    parties,
    extends: extendsEdges,
    exposes,
    binds,
    offers,
    ports,
  };
}
