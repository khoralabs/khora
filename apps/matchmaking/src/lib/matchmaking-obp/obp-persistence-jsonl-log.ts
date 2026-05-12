import type { JsonlStore } from "@khoralabs/memories-stores";
import type {
  BindPortInput,
  ExposePortInput,
  ExtendOfferInput,
  GetOfferResult,
  GetPartyResult,
  GetPortResult,
  ObpPersistence,
  Offer,
  Party,
  Port,
  RegisterPartyInput,
} from "@khoralabs/obp-core";

export type LoggingObpPersistenceOptions = {
  store: JsonlStore;
  /** Synthetic memory id for JsonlStore lines (e.g. matchmaking-obp/{runId}). */
  memoryId: string;
  /** Wall-clock ms for log lines (defaults to Date.now). */
  nowMs?: () => number;
};

function nextStepKey(seq: { n: number }, op: string): string {
  const n = seq.n++;
  const safe = op.replace(/[/\n\r]/g, "_").slice(0, 64);
  return `step/${String(n).padStart(4, "0")}/${safe}`;
}

function appendStep(
  store: JsonlStore,
  memoryId: string,
  seq: { n: number },
  nowMs: () => number,
  op: string,
  input: unknown,
  output?: unknown,
): void {
  const line = JSON.stringify({
    kind: "obp",
    op,
    ts: nowMs(),
    input,
    ...(output !== undefined ? { output } : {}),
  });
  store.appendStringEntry(memoryId, nextStepKey(seq, op), line);
}

/**
 * Delegates to inner {@link ObpPersistence} and appends one JSONL line per successful mutation.
 */
export function createLoggingObpPersistence(
  inner: ObpPersistence,
  options: LoggingObpPersistenceOptions,
): ObpPersistence {
  const { store, memoryId } = options;
  const nowMs = options.nowMs ?? (() => Date.now());
  const seq = { n: 0 };

  return {
    registerParty(input: RegisterPartyInput): { party: Party } {
      const out = inner.registerParty(input);
      appendStep(
        store,
        memoryId,
        seq,
        nowMs,
        "registerParty",
        { name: input.name.trim() },
        {
          partyId: out.party.id,
        },
      );
      return out;
    },

    getParty(id: string): GetPartyResult {
      return inner.getParty(id);
    },

    getOffer(id: string): GetOfferResult {
      return inner.getOffer(id);
    },

    getPort(id: string): GetPortResult {
      return inner.getPort(id);
    },

    extendOffer(input: ExtendOfferInput): { offer: Offer } {
      const out = inner.extendOffer(input);
      appendStep(
        store,
        memoryId,
        seq,
        nowMs,
        "extendOffer",
        { partyId: input.partyId, offerType: input.offer.type },
        { offerId: out.offer.id },
      );
      return out;
    },

    exposePort(input: ExposePortInput): { port: Port } {
      const out = inner.exposePort(input);
      appendStep(
        store,
        memoryId,
        seq,
        nowMs,
        "exposePort",
        { offerId: input.offerId, portType: input.port.type },
        { portId: out.port.id },
      );
      return out;
    },

    bindPort(input: BindPortInput): void {
      inner.bindPort(input);
      appendStep(store, memoryId, seq, nowMs, "bindPort", {
        offerId: input.offerId,
        portId: input.portId,
      });
    },

    isPortExposed(portId: string): boolean {
      return inner.isPortExposed(portId);
    },

    listBinds() {
      return inner.listBinds();
    },

    getPortsSnapshot() {
      return inner.getPortsSnapshot();
    },

    getExtendingPartyId(offerId: string): string | null {
      return inner.getExtendingPartyId(offerId);
    },

    listExposedPortEdges() {
      return inner.listExposedPortEdges();
    },

    setPortExpiredNow(portId: string): void {
      inner.setPortExpiredNow(portId);
      appendStep(store, memoryId, seq, nowMs, "setPortExpiredNow", { portId });
    },

    setOfferExpiredNow(offerId: string): void {
      inner.setOfferExpiredNow(offerId);
      appendStep(store, memoryId, seq, nowMs, "setOfferExpiredNow", { offerId });
    },
  };
}
