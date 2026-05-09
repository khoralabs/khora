import { expect, test } from "bun:test";
import type { NegotiationBindTurnAudit, NegotiationGenesisTurnAudit } from "./runtime.ts";
import { auditToTurnBody } from "./wire-bridge.ts";

test("auditToTurnBody returns committed genesis TurnBody", () => {
  const committedTurnBody = {
    offerId: "offer-a",
    offerType: "seller.open",
    ports: [{ id: "port-x", isTerminal: false, portType: "t", promise: "hi", max_bindings: 1 }],
  };
  const audit = {
    kind: "genesis",
    turnIndex: 0,
    actingPartyId: "p1",
    newOfferId: "offer-a",
    newOfferType: "seller.open",
    exposedPortIds: ["port-x"],
    exposedPorts: [{ portType: "t", promise: "hi", terminal: false }],
    committedTurnBody,
  } satisfies NegotiationGenesisTurnAudit;
  expect(auditToTurnBody(audit)).toEqual(committedTurnBody);
});

test("auditToTurnBody returns committed bind TurnBody", () => {
  const committedTurnBody = {
    offerId: "offer-b",
    offerType: "buyer.reply",
    bindPortId: "target-port",
    counterparty_bind: {},
  };
  const audit = {
    kind: "bind",
    turnIndex: 1,
    actingPartyId: "p2",
    chosenPortId: "target-port",
    chosenPortType: "listing",
    headOfferId: "o",
    counterpartyHeadOfferType: "seller.open",
    bindKind: "real",
    bindMenu: [],
    newOfferId: "offer-b",
    newOfferType: "buyer.reply",
    exposedPortIds: [],
    exposedPorts: [],
    committedTurnBody,
  } satisfies NegotiationBindTurnAudit;
  expect(auditToTurnBody(audit)).toEqual(committedTurnBody);
});
