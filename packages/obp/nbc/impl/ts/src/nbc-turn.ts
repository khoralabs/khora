/**
 * Apply one bilateral NBC turn: **`ExtendOffer`**, optional **`ExposePort`**s, optional **`BindPort`**.
 */

import { ObpError } from "@khoralabs/obp-errors";
import type { JsonDocument, Offer } from "@khoralabs/obp-model";
import type { ObpPersistenceClient } from "@khoralabs/obp-persistence";
import {
  isActiveBindPolicy,
  type NbcBindFailure,
  type NbcBindPolicyValidateFn,
  type NbcBindTiming,
  validateNbcBind,
} from "./nbc-invariants";
import { type NbcTurnBody, nbcPortSpecToPort } from "./nbc-types";

export type ApplyNbcTurnParams = {
  /** Party id on **`EXTENDS`** for the new offer (`ExtendOffer.partyId`). */
  partyId: string;
  body: NbcTurnBody;
  client: ObpPersistenceClient;
  timing: NbcBindTiming;
  /** NBC N4: host validation when **`bind_policy`** is active on the bind target port. */
  validateBindPayload?: NbcBindPolicyValidateFn | undefined;
};

export type ApplyNbcTurnResult = {
  offerId: string;
  offer: Offer;
  exposedPortIds: readonly string[];
};

export function obpErrorFromBindFailure(f: NbcBindFailure): ObpError {
  switch (f.code) {
    case "EXPIRED":
      return new ObpError("EXPIRED", `${f.entity} expired (NBC N1)`);
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
  const { partyId, body, client, timing, validateBindPayload } = params;

  const { offer } = await client.extendOffer({
    partyId,
    offer: {
      id: body.offer.id,
      type: body.offer.type,
    },
    nbc_expires_turn: body.offer.expires_turn,
    nbc_expires_at_relay_ms: body.offer.expires_at_relay_ms,
    bindPortId: "",
    bind_payload: null,
  });
  const offerId = offer.id;
  const exposedPortIds: string[] = [];
  const localPolicy = new Map<string, JsonDocument>();

  for (const spec of body.ports) {
    const { port } = await client.exposePort({
      offerId,
      port: nbcPortSpecToPort(spec),
      nbc_expires_turn: spec.expires_turn,
      nbc_expires_at_relay_ms: spec.expires_at_relay_ms,
      bind_policy: spec.bind_policy ?? null,
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

    const offerWinRes = await client.getNbcBindWindowForOffer(offerId);
    const portWinRes = await client.getNbcBindWindowForPort(body.bind_port_id);
    if (offerWinRes.result.kind !== "window") {
      throw new ObpError("NOT_FOUND", `NBC bind window missing for offer: ${offerId}`);
    }
    if (portWinRes.result.kind !== "window") {
      throw new ObpError("NOT_FOUND", `NBC bind window missing for port: ${body.bind_port_id}`);
    }

    const fromLocal = localPolicy.get(body.bind_port_id);
    let bindPolicy: JsonDocument | null;
    if (fromLocal !== undefined) {
      bindPolicy = fromLocal;
    } else {
      const pr = await client.getPortBindPolicy({ portId: body.bind_port_id });
      if (pr.result.kind === "notFound") {
        throw new ObpError(
          "NOT_FOUND",
          `bind_policy snapshot missing for port: ${body.bind_port_id}`,
        );
      }
      bindPolicy = pr.result.bind_policy;
    }

    const bindResult = await validateNbcBind({
      timing,
      offer: offerNow,
      port,
      offerBindWindow: offerWinRes.result.window,
      portBindWindow: portWinRes.result.window,
      portsById,
      targetPortIsExposed: exposed,
      bindPolicy,
      bindPayload: body.bind_payload,
      validateBindPayload,
    });
    if (!bindResult.ok) {
      throw obpErrorFromBindFailure(bindResult.failure);
    }

    await client.bindPort({
      offerId,
      portId: body.bind_port_id,
      bind_payload: bindResult.normalizedBindPayload,
    });
  }

  return { offerId, offer, exposedPortIds };
}
