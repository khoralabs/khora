import { validateCounterpartyBindForPort } from "../../bind-policy/validate.ts";
import { type BindValidationFailure, validateBindPreconditions } from "../../invariants/bind.ts";
import type {
  BindPortInput,
  ContentAddressedSourceRef,
  ExposePortInput,
  ExtendOfferInput,
  GetOfferResult,
  GetPartyResult,
  GetPortResult,
  Offer,
  Party,
  Port,
  RegisterPartyInput,
} from "../../model/types.ts";
import { FakeObpPersistence } from "../../testing/fake-obp-persistence.ts";
import { ObpError } from "./errors.ts";
import type { ObpPersistence } from "./persistence-types.ts";

export type OBPPersistenceClientOptions = {
  /** Monotonic ledger sequence for expiry checks and revoke stamping; required (no wall-clock default). */
  ledgerSeq: () => number;
  /** Omit to use in-memory {@link FakeObpPersistence}. */
  persistence?: ObpPersistence;
};

const CONTENT_HASH_HEX64 = /^[0-9a-f]{64}$/;

function assertValidContentReceipts(receipts: ContentAddressedSourceRef[] | undefined): void {
  if (receipts === undefined || receipts.length === 0) return;
  for (const r of receipts) {
    if (typeof r.resource_id !== "string" || typeof r.source_key !== "string") {
      throw new ObpError(
        "VALIDATION",
        "content_receipts require resource_id and source_key strings",
      );
    }
    if (!CONTENT_HASH_HEX64.test(r.content_sha256_hex)) {
      throw new ObpError("VALIDATION", "content_sha256_hex must be 64 lowercase hex chars");
    }
  }
}

function throwIfBindInvalid(failure: BindValidationFailure): never {
  switch (failure.code) {
    case "EXPIRED":
      throw new ObpError("EXPIRED", `Entity expired (${failure.entity})`);
    case "NOT_EXPOSED":
      throw new ObpError("NOT_EXPOSED", "Port is not exposed");
    case "REF_CYCLE":
      throw new ObpError("REF_CYCLE", `Port ref cycle: ${failure.path.join(" -> ")}`);
    case "REF_MISSING":
      throw new ObpError("REF_MISSING", `Missing port in ref chain: ${failure.missingId}`);
    case "MAX_BINDINGS":
      throw new ObpError(
        "MAX_BINDINGS",
        `max_bindings (${failure.max}) reached for canonical port ${failure.canonicalId} (current ${failure.current})`,
      );
    default: {
      const _exhaustive: never = failure;
      throw new ObpError("VALIDATION", String(_exhaustive));
    }
  }
}

/**
 * OBP workflows with **strategy** {@link ObpPersistence}: validates using pure invariants then delegates.
 * Mirrors the pattern of {@code MemoriesClient} + {@code MemoriesPersistence}.
 *
 * - **`new OBPPersistenceClient({ ledgerSeq })`** — in-memory {@link FakeObpPersistence}.
 * - **`new OBPPersistenceClient({ ledgerSeq, persistence })`** — explicit store.
 */
export class OBPPersistenceClient {
  private readonly persistence: ObpPersistence;

  private readonly options: Pick<OBPPersistenceClientOptions, "ledgerSeq">;

  constructor(options: OBPPersistenceClientOptions) {
    const { persistence, ledgerSeq } = options;
    this.options = { ledgerSeq };
    this.persistence = persistence ?? new FakeObpPersistence(ledgerSeq);
  }

  private ledgerSeq(): number {
    return this.options.ledgerSeq();
  }

  getParty(id: string): GetPartyResult {
    return this.persistence.getParty(id);
  }

  getOffer(id: string): GetOfferResult {
    return this.persistence.getOffer(id);
  }

  getPort(id: string): GetPortResult {
    return this.persistence.getPort(id);
  }

  /** Party that extends (owns) this offer in the graph, if present. */
  getExtendingPartyId(offerId: string): string | null {
    return this.persistence.getExtendingPartyId(offerId);
  }

  registerParty(input: RegisterPartyInput): { party: Party } {
    const name = input.name.trim();
    if (name === "") {
      throw new ObpError("VALIDATION", "name must be non-empty");
    }
    return this.persistence.registerParty({ ...input, name });
  }

  extendOffer(input: ExtendOfferInput): { offer: Offer } {
    const party = this.persistence.getParty(input.partyId);
    if (party.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Party not found: ${input.partyId}`);
    }

    const bindPortId = input.bindPortId.trim();
    const cr = input.content_receipts;
    if (bindPortId === "" && cr !== undefined && cr.length > 0) {
      throw new ObpError("VALIDATION", "content_receipts only allowed when bindPortId is set");
    }
    if (bindPortId !== "") {
      const portRes = this.persistence.getPort(bindPortId);
      if (portRes.kind === "notFound") {
        throw new ObpError("NOT_FOUND", `Port not found: ${bindPortId}`);
      }
      const fail = validateBindPreconditions({
        ledgerSeq: this.ledgerSeq(),
        offer: input.offer,
        port: portRes.port,
        portsById: this.persistence.getPortsSnapshot(),
        targetPortIsExposed: this.persistence.isPortExposed(bindPortId),
        binds: this.persistence.listBinds(),
      });
      if (fail !== null) {
        throwIfBindInvalid(fail);
      }
      const normalizedBind = validateCounterpartyBindForPort(portRes.port, input.counterparty_bind);
      assertValidContentReceipts(cr);
      return this.persistence.extendOffer({
        ...input,
        bindPortId,
        counterparty_bind: normalizedBind,
      });
    }

    const cb = input.counterparty_bind;
    if (
      cb !== undefined &&
      cb !== null &&
      typeof cb === "object" &&
      !Array.isArray(cb) &&
      Object.keys(cb).length > 0
    ) {
      throw new ObpError("VALIDATION", "counterparty_bind is only allowed when bindPortId is set");
    }

    return this.persistence.extendOffer({ ...input, bindPortId });
  }

  exposePort(input: ExposePortInput): { port: Port } {
    const offer = this.persistence.getOffer(input.offerId);
    if (offer.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
    }
    if (input.port.max_bindings < 0) {
      throw new ObpError("VALIDATION", "max_bindings must be non-negative");
    }
    if (input.port.promise.trim() === "") {
      throw new ObpError("VALIDATION", "port.promise must be non-empty");
    }
    return this.persistence.exposePort(input);
  }

  bindPort(input: BindPortInput): void {
    const offerRes = this.persistence.getOffer(input.offerId);
    if (offerRes.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Offer not found: ${input.offerId}`);
    }
    const portRes = this.persistence.getPort(input.portId);
    if (portRes.kind === "notFound") {
      throw new ObpError("NOT_FOUND", `Port not found: ${input.portId}`);
    }

    const fail = validateBindPreconditions({
      ledgerSeq: this.ledgerSeq(),
      offer: offerRes.offer,
      port: portRes.port,
      portsById: this.persistence.getPortsSnapshot(),
      targetPortIsExposed: this.persistence.isPortExposed(input.portId),
      binds: this.persistence.listBinds(),
    });
    if (fail !== null) {
      throwIfBindInvalid(fail);
    }

    const normalizedBind = validateCounterpartyBindForPort(portRes.port, input.counterparty_bind);
    assertValidContentReceipts(input.content_receipts);
    this.persistence.bindPort({ ...input, counterparty_bind: normalizedBind });
  }

  /** All EXPOSES edges for orchestration (e.g. dynamic bind tools). */
  listExposedPortEdges(): ReadonlyArray<{ offerId: string; portId: string }> {
    return this.persistence.listExposedPortEdges();
  }

  /**
   * Revoke a port at the current ledger sequence (**`expires_seq`**). **Caller** must ensure the acting party may revoke this port.
   */
  expirePortNow(portId: string): void {
    this.persistence.setPortExpiresSeq(portId, this.ledgerSeq());
  }

  /**
   * Revoke an offer and cascade **`expires_seq`** to ports exposed on that offer. **Caller** must ensure the acting party extends this offer.
   */
  expireOfferNow(offerId: string): void {
    this.persistence.setOfferExpiresSeq(offerId, this.ledgerSeq());
  }
}
