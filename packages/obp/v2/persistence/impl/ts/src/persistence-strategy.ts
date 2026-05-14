/**
 * **`ObpPersistenceStrategy`** — the adapter interface every persistence backend must implement.
 *
 * Pass a concrete strategy to {@link ObpPersistenceClient} to swap backends without changing
 * call-site code. Implementations may be in-memory, SQLite, Convex, PostgreSQL, etc.
 *
 * Each method mirrors one `ObpPersistence` Smithy operation from
 * `packages/obp/v2/persistence/spec/model/persistence.smithy`.
 */

import type {
  BindPortInput,
  BindPortOutput,
  ExposePortInput,
  ExposePortOutput,
  ExtendOfferInput,
  ExtendOfferOutput,
  GetExtendingPartyIdInput,
  GetExtendingPartyIdOutput,
  GetOfferInput,
  GetOfferOutput,
  GetPartyInput,
  GetPartyOutput,
  GetPortInput,
  GetPortOutput,
  GetPortsSnapshotInput,
  GetPortsSnapshotOutput,
  IsPortExposedInput,
  IsPortExposedOutput,
  ListBindsInput,
  ListBindsOutput,
  ListExposedPortEdgesInput,
  ListExposedPortEdgesOutput,
  RegisterPartyInput,
  RegisterPartyOutput,
  SetOfferExpiredNowInput,
  SetOfferExpiredNowOutput,
  SetPortExpiredNowInput,
  SetPortExpiredNowOutput,
} from "./persistence-types.ts";

export interface ObpPersistenceStrategy {
  registerParty(input: RegisterPartyInput): Promise<RegisterPartyOutput>;
  getParty(input: GetPartyInput): Promise<GetPartyOutput>;
  getOffer(input: GetOfferInput): Promise<GetOfferOutput>;
  getPort(input: GetPortInput): Promise<GetPortOutput>;
  extendOffer(input: ExtendOfferInput): Promise<ExtendOfferOutput>;
  exposePort(input: ExposePortInput): Promise<ExposePortOutput>;
  bindPort(input: BindPortInput): Promise<BindPortOutput>;
  listExposedPortEdges(input: ListExposedPortEdgesInput): Promise<ListExposedPortEdgesOutput>;
  isPortExposed(input: IsPortExposedInput): Promise<IsPortExposedOutput>;
  listBinds(input: ListBindsInput): Promise<ListBindsOutput>;
  getPortsSnapshot(input: GetPortsSnapshotInput): Promise<GetPortsSnapshotOutput>;
  getExtendingPartyId(input: GetExtendingPartyIdInput): Promise<GetExtendingPartyIdOutput>;
  setPortExpiredNow(input: SetPortExpiredNowInput): Promise<SetPortExpiredNowOutput>;
  setOfferExpiredNow(input: SetOfferExpiredNowInput): Promise<SetOfferExpiredNowOutput>;
}
