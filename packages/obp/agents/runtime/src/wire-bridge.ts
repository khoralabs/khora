import type { PortSpec, TurnBody } from "@cfd/obp-core";

import type { NegotiationTurnAudit } from "./runtime.ts";

/**
 * Builds an OBP frame-layer {@link TurnBody} after {@link NegotiationRuntime.applyGenesisTurn}
 * / {@link NegotiationRuntime.applyTurn} (or structured bilateral {@link TurnContract.apply}).
 *
 * {@link NegotiationTurnAudit.exposedPortIds} carries persisted canonical ids; `rawOutput` must carry the agent's `ports`
 * slice order-aligned so wire specs ({@link PortSpec.isTerminal}, bind_policy, max_bindings) can be reconstructed.
 */
export function auditToTurnBody(audit: NegotiationTurnAudit, rawOutput: unknown): TurnBody {
  const out = rawOutput as {
    ports?: ReadonlyArray<{
      terminal: boolean;
      max_bindings?: number;
      bind_policy?: unknown;
    }>;
  };
  const ports: PortSpec[] = audit.exposedPortIds.map((id, i) => {
    const spec = out.ports?.[i];
    const row: PortSpec = {
      id,
      isTerminal: spec?.terminal ?? false,
      ...(spec?.max_bindings !== undefined ? { max_bindings: spec.max_bindings } : {}),
    };
    if (
      spec?.bind_policy !== undefined &&
      spec.bind_policy !== null &&
      typeof spec.bind_policy === "object"
    ) {
      row.bind_policy = spec.bind_policy as PortSpec["bind_policy"];
    }
    return row;
  });

  const body: TurnBody = {
    offerId: audit.newOfferId,
    offerType: audit.newOfferType,
    ...(ports.length > 0 ? { ports } : {}),
  };

  if (audit.kind === "bind") {
    body.bindPortId = audit.chosenPortId;
    body.counterparty_bind =
      audit.counterpartyBind !== undefined && Object.keys(audit.counterpartyBind).length > 0
        ? audit.counterpartyBind
        : {};
  }

  return body;
}
