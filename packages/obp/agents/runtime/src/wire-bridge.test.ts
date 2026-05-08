import { expect, test } from "bun:test";
import type { NegotiationGenesisTurnAudit } from "./runtime.ts";
import { auditToTurnBody } from "./wire-bridge.ts";

test("auditToTurnBody genesis wires expose ids and terminal flags", () => {
  const audit: NegotiationGenesisTurnAudit = {
    kind: "genesis",
    turnIndex: 0,
    actingPartyId: "p1",
    newOfferId: "offer-a",
    newOfferType: "seller.open",
    exposedPortIds: ["port-x"],
    exposedPorts: [{ portType: "t", promise: "hi", terminal: false }],
  };
  const body = auditToTurnBody(audit, {
    ports: [{ terminal: false }],
  });
  expect(body.offerType).toBe("seller.open");
  expect(body.ports?.length).toBe(1);
  expect(body.ports?.[0]?.id).toBe("port-x");
  expect(body.bindPortId).toBeUndefined();
});

test("auditToTurnBody bind includes bindPortId", () => {
  const audit = {
    kind: "bind" as const,
    turnIndex: 1,
    actingPartyId: "p2",
    chosenPortId: "target-port",
    chosenPortType: "listing",
    headOfferId: "o",
    counterpartyHeadOfferType: "seller.open",
    bindKind: "real" as const,
    bindMenu: [],
    newOfferId: "offer-b",
    newOfferType: "buyer.reply",
    exposedPortIds: [],
    exposedPorts: [],
  };
  const body = auditToTurnBody(audit, {});
  expect(body.bindPortId).toBe("target-port");
  expect(body.counterparty_bind).toEqual({});
});
