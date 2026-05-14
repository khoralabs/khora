/**
 * Apply one bilateral NBC turn: **`ExtendOffer`**, optional **`ExposePort`**s, optional **`BindPort`**.
 */

import { ObpError } from "@khoralabs/obp-v2-errors";
import type { JsonDocument, Offer } from "@khoralabs/obp-v2-model";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
import {
  isActiveBindPolicy,
  type NbcBindFailure,
  type ValidateNbcBindInput,
  validateNbcBind,
} from "./nbc-invariants.ts";
import { type NbcTurnBody, nbcPortSpecToPort } from "./nbc-types.ts";

export type ApplyNbcTurnParams = {
  /** Party id on **`EXTENDS`** for the new offer (`ExtendOffer.partyId`). */
  partyId: string;
  body: NbcTurnBody;
  client: ObpPersistenceClient;
  ledgerSeq: bigint;
  /** Resolve expose-time **`bind_policy`** for a port id (e.g. counterparty ports). */
  getBindPolicyForPort?: (portId: string) => JsonDocument | null | Promise<JsonDocument | null>;
  validatePolicy?: ValidateNbcBindInput["validatePolicy"];
};

export type ApplyNbcTurnResult = {
  offerId: string;
  offer: Offer;
  exposedPortIds: readonly string[];
};

export function obpErrorFromBindFailure(f: NbcBindFailure): ObpError {
  switch (f.code) {
    case "EXPIRED":
      return new ObpError("EXPIRED", `${f.entity} expired at ledger (NBC N1)`);
    case "NOT_EXPOSED":
      return new ObpError("NOT_EXPOSED", "bind target port is not exposed");
    case "REF_CYCLE":
      return new ObpError("REF_CYCLE", `port ref cycle: ${f.path.join(" -> ")}`);
    case "REF_MISSING":
      return new ObpError("REF_MISSING", `port ref missing: ${f.missingId}`);
    case "POLICY_REJECTED":
      return new ObpError("VALIDATION", f.reason);
    default: {
      const _exhaustive: never = f;
      return _exhaustive;
    }
  }
}

/**
 * Commit **`body`** to **`client`**: extend offer, expose ports, optionally bind.
 * @throws {ObpError} on bind validation failure; @throws {TypeError} from invalid **`body`** shape upstream if caller skipped parse.
 */
export async function applyNbcTurn(params: ApplyNbcTurnParams): Promise<ApplyNbcTurnResult> {
  const { partyId, body, client, ledgerSeq, getBindPolicyForPort, validatePolicy } = params;

  const { offer } = await client.extendOffer({
    partyId,
    offer: body.offer,
    bindPortId: "",
    counterparty_bind: null,
  });
  const offerId = offer.id;
  const exposedPortIds: string[] = [];
  const localPolicy = new Map<string, JsonDocument>();

  for (const spec of body.ports) {
    const { port } = await client.exposePort({
      offerId,
      port: nbcPortSpecToPort(spec),
    });
    exposedPortIds.push(port.id);
    if (isActiveBindPolicy(spec.bind_policy)) {
      localPolicy.set(port.id, spec.bind_policy);
    }
  }

  if (body.bind_port_id !== "") {
    const snapOut = await client.getPortsSnapshot();
    const portsById = new Map(snapOut.entries.map((e) => [e.portId, e.port]));
    const { exposed } = await client.isPortExposed(body.bind_port_id);
    const portRes = await client.getPort({ id: body.bind_port_id });
    if (portRes.result.kind !== "port") {
      throw new ObpError("NOT_FOUND", `bind_port_id not found: ${body.bind_port_id}`);
    }
    const port = portRes.result.port;
    const offerRes = await client.getOffer({ id: offerId });
    if (offerRes.result.kind !== "offer") {
      throw new ObpError("NOT_FOUND", `offer not found after extend: ${offerId}`);
    }
    const offerNow = offerRes.result.offer;

    const fromLocal = localPolicy.get(body.bind_port_id);
    const bindPolicy =
      fromLocal ??
      (getBindPolicyForPort ? await getBindPolicyForPort(body.bind_port_id) : null) ??
      null;

    const failure = await validateNbcBind({
      ledgerSeq,
      offer: offerNow,
      port,
      portsById,
      targetPortIsExposed: exposed,
      bindPolicy,
      counterpartyBind: body.counterparty_bind,
      validatePolicy,
    });
    if (failure) {
      throw obpErrorFromBindFailure(failure);
    }

    await client.bindPort({
      offerId,
      portId: body.bind_port_id,
      counterparty_bind: body.counterparty_bind,
    });
  }

  return { offerId, offer, exposedPortIds };
}
