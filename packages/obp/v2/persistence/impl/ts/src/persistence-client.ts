/**
 * **`ObpPersistenceClient`** — strategy-pattern client for `ObpPersistence`.
 *
 * Wrap any {@link ObpPersistenceStrategy} backend to get a uniform call surface with
 * OBP invariant enforcement (invariant 4: non-empty party name) and ergonomic
 * `*OrNull` helpers that unwrap result unions.
 */

import { ObpError } from "@khoralabs/obp-v2-errors";
import type { Offer, Party, Port } from "@khoralabs/obp-v2-model";
import type { ObpPersistenceStrategy } from "./persistence-strategy.ts";
import type {
  BindPortInput,
  BindPortOutput,
  ExposePortInput,
  ExposePortOutput,
  ExtendOfferInput,
  ExtendOfferOutput,
  GetOfferInput,
  GetOfferOutput,
  GetPartyInput,
  GetPartyOutput,
  GetPortBindPolicyInput,
  GetPortBindPolicyOutput,
  GetPortInput,
  GetPortOutput,
  GetNbcBindWindowForOfferOutput,
  GetNbcBindWindowForPortOutput,
  GetPortsSnapshotOutput,
  IsPortExposedOutput,
  ListBindsOutput,
  ListExposedPortEdgesOutput,
  RegisterPartyInput,
  RegisterPartyOutput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowOutput,
} from "./persistence-types.ts";

export class ObpPersistenceClient {
  constructor(private readonly strategy: ObpPersistenceStrategy) {}

  // -------------------------------------------------------------------------
  // RegisterParty — enforces invariant 4: name must be non-empty after trim.
  // -------------------------------------------------------------------------

  registerParty(input: RegisterPartyInput): Promise<RegisterPartyOutput> {
    if (!input.name.trim()) {
      throw new ObpError("VALIDATION", "Party.name must be non-empty (OBP invariant 4)");
    }
    return this.strategy.registerParty(input);
  }

  // -------------------------------------------------------------------------
  // Direct delegation — GetParty / GetOffer / GetPort
  // -------------------------------------------------------------------------

  getParty(input: GetPartyInput): Promise<GetPartyOutput> {
    return this.strategy.getParty(input);
  }

  getOffer(input: GetOfferInput): Promise<GetOfferOutput> {
    return this.strategy.getOffer(input);
  }

  getPort(input: GetPortInput): Promise<GetPortOutput> {
    return this.strategy.getPort(input);
  }

  getPortBindPolicy(input: GetPortBindPolicyInput): Promise<GetPortBindPolicyOutput> {
    return this.strategy.getPortBindPolicy(input);
  }

  // -------------------------------------------------------------------------
  // Ergonomic helpers — unwrap result unions to T | null
  // -------------------------------------------------------------------------

  async getPartyOrNull(id: string): Promise<Party | null> {
    const { result } = await this.getParty({ id });
    return result.kind === "party" ? result.party : null;
  }

  async getOfferOrNull(id: string): Promise<Offer | null> {
    const { result } = await this.getOffer({ id });
    return result.kind === "offer" ? result.offer : null;
  }

  async getPortOrNull(id: string): Promise<Port | null> {
    const { result } = await this.getPort({ id });
    return result.kind === "port" ? result.port : null;
  }

  // -------------------------------------------------------------------------
  // Mutation operations
  // -------------------------------------------------------------------------

  extendOffer(input: ExtendOfferInput): Promise<ExtendOfferOutput> {
    return this.strategy.extendOffer(input);
  }

  exposePort(input: ExposePortInput): Promise<ExposePortOutput> {
    return this.strategy.exposePort(input);
  }

  bindPort(input: BindPortInput): Promise<BindPortOutput> {
    return this.strategy.bindPort(input);
  }

  // -------------------------------------------------------------------------
  // Read helpers (orchestration / NBC precondition queries)
  // -------------------------------------------------------------------------

  listExposedPortEdges(): Promise<ListExposedPortEdgesOutput> {
    return this.strategy.listExposedPortEdges({});
  }

  isPortExposed(portId: string): Promise<IsPortExposedOutput> {
    return this.strategy.isPortExposed({ portId });
  }

  listBinds(): Promise<ListBindsOutput> {
    return this.strategy.listBinds({});
  }

  getPortsSnapshot(): Promise<GetPortsSnapshotOutput> {
    return this.strategy.getPortsSnapshot({});
  }

  async getExtendingPartyId(offerId: string): Promise<string | null> {
    const { partyId } = await this.strategy.getExtendingPartyId({ offerId });
    return partyId === "" ? null : partyId;
  }

  getNbcBindWindowForOffer(offerId: string): Promise<GetNbcBindWindowForOfferOutput> {
    return this.strategy.getNbcBindWindowForOffer({ offerId });
  }

  getNbcBindWindowForPort(portId: string): Promise<GetNbcBindWindowForPortOutput> {
    return this.strategy.getNbcBindWindowForPort({ portId });
  }

  async getNbcBindWindowForOfferOrNull(offerId: string) {
    const { result } = await this.getNbcBindWindowForOffer(offerId);
    return result.kind === "window" ? result.window : null;
  }

  async getNbcBindWindowForPortOrNull(portId: string) {
    const { result } = await this.getNbcBindWindowForPort(portId);
    return result.kind === "window" ? result.window : null;
  }

  // -------------------------------------------------------------------------
  // Expiry mutations
  // -------------------------------------------------------------------------

  setPortExpiredNow(portId: string): Promise<SetPortExpiredNowOutput> {
    return this.strategy.setPortExpiredNow({ portId });
  }

  setOfferExpiredNow(offerId: string): Promise<SetOfferExpiredNowOutput> {
    return this.strategy.setOfferExpiredNow({ offerId });
  }
}
