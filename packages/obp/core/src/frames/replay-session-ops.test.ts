import { expect, test } from "bun:test";
import { OBPPersistenceClient, ObpError } from "@khoralabs/obp-persistence-client";
import { FakeObpPersistence } from "../testing/index.ts";
import { applySessionOp, applySessionOps, applySessionOpsMultiplex } from "./replay-session-ops.ts";
import type { SessionOp } from "./to-session-op.ts";
import type { SessionInit } from "./types.ts";

function setupParties() {
  let seq = 0;
  const ledgerSeq = () => ++seq;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const responder = persistence.registerParty({ name: "srv", sourcemaps: [] }).party;
  const initiator = persistence.registerParty({ name: "cli", sourcemaps: [] }).party;
  const client = new OBPPersistenceClient({ persistence, ledgerSeq });
  const init: SessionInit = {
    session_id: "sid",
    parties: [
      { id: responder.id, pubkey: "pk0" },
      { id: initiator.id, pubkey: "pk1" },
    ],
    genesis_hash: "0".repeat(64),
  };
  return { persistence, client, init, ledgerSeq };
}

test("applySessionOps: expose then bind (turn ops)", () => {
  const { persistence, client, init } = setupParties();
  const ops: SessionOp[] = [
    {
      kind: "turn",
      payload: {
        actor: "pk0",
        offerId: "greeting",
        offerType: "obp.frame",
        ports: [{ id: "p1", isTerminal: false }],
      },
    },
    {
      kind: "turn",
      payload: {
        actor: "pk1",
        offerId: "",
        offerType: "obp.frame.bind",
        bindPortId: "p1",
        counterparty_bind: {},
      },
    },
  ];
  applySessionOps(client, init, ops);
  expect(persistence.isPortExposed("p1")).toBe(true);
  expect(persistence.listBinds().length).toBe(1);
  expect(persistence.listBinds()[0]?.portId).toBe("p1");
  expect(persistence.getExtendingPartyId("greeting")).toBe(init.parties[0].id);
});

test("applySessionOps: terminate invokes hook only", () => {
  const { client, init } = setupParties();
  let terminated: string | undefined;
  applySessionOps(client, init, [{ kind: "terminate", payload: { reason: "bye", code: "c1" } }], {
    onTerminate: (r, c) => {
      terminated = `${r}:${c}`;
    },
  });
  expect(terminated).toBe("bye:c1");
});

test("applySessionOpsMultiplex: routes ops by session_id", () => {
  const { persistence, client, init } = setupParties();
  const initB: SessionInit = {
    ...init,
    session_id: "sid-b",
    genesis_hash: "b".repeat(64),
  };
  const ops: SessionOp[] = [
    {
      kind: "turn",
      session_id: init.session_id,
      payload: {
        actor: "pk0",
        offerId: "a1",
        offerType: "obp.frame",
        ports: [{ id: "pa", isTerminal: false }],
      },
    },
    {
      kind: "turn",
      session_id: initB.session_id,
      payload: {
        actor: "pk0",
        offerId: "b1",
        offerType: "obp.frame",
        ports: [{ id: "pb", isTerminal: false }],
      },
    },
  ];
  const m = new Map<string, SessionInit>([
    [init.session_id, init],
    [initB.session_id, initB],
  ]);
  applySessionOpsMultiplex(client, m, ops);
  expect(persistence.isPortExposed("pa")).toBe(true);
  expect(persistence.isPortExposed("pb")).toBe(true);
  expect(persistence.getExtendingPartyId("a1")).toBe(init.parties[0].id);
  expect(persistence.getExtendingPartyId("b1")).toBe(initB.parties[0].id);
});

test("applySessionOpsMultiplex: rejects missing session_id", () => {
  const { client, init } = setupParties();
  expect(() =>
    applySessionOpsMultiplex(client, new Map([[init.session_id, init]]), [
      { kind: "turn", payload: { actor: "pk0", offerId: "x", offerType: "t" } },
    ]),
  ).toThrow(ObpError);
});

test("applySessionOp rejects unknown kind", () => {
  const { client, init } = setupParties();
  expect(() => applySessionOp(client, init, { kind: "nope", payload: {} })).toThrow(ObpError);
});

test("applySessionOps: second bind exceeds max_bindings (defaults)", () => {
  const { client, init } = setupParties();
  const ops: SessionOp[] = [
    {
      kind: "turn",
      payload: {
        actor: "pk0",
        offerId: "o",
        offerType: "obp.frame",
        ports: [{ id: "one_slot", isTerminal: false }],
      },
    },
    {
      kind: "turn",
      payload: {
        actor: "pk1",
        offerId: "",
        offerType: "obp.frame.bind",
        bindPortId: "one_slot",
        counterparty_bind: {},
      },
    },
    {
      kind: "turn",
      payload: {
        actor: "pk1",
        offerId: "",
        offerType: "obp.frame.bind",
        bindPortId: "one_slot",
        counterparty_bind: {},
      },
    },
  ];
  expect(() => applySessionOps(client, init, ops)).toThrow(ObpError);
});

test("applySessionOps: two binds allowed when max_bindings is 2", () => {
  const { persistence, client, init } = setupParties();
  const ops: SessionOp[] = [
    {
      kind: "turn",
      payload: {
        actor: "pk0",
        offerId: "o",
        offerType: "obp.frame",
        ports: [{ id: "p", isTerminal: false, max_bindings: 2 }],
      },
    },
    {
      kind: "turn",
      payload: {
        actor: "pk1",
        offerId: "",
        offerType: "obp.frame.bind",
        bindPortId: "p",
        counterparty_bind: {},
      },
    },
    {
      kind: "turn",
      payload: {
        actor: "pk1",
        offerId: "",
        offerType: "obp.frame.bind",
        bindPortId: "p",
        counterparty_bind: {},
      },
    },
  ];
  applySessionOps(client, init, ops);
  expect(persistence.listBinds().length).toBe(2);
});

test("applySessionOp: invalid max_bindings on turn", () => {
  const { client, init } = setupParties();
  expect(() =>
    applySessionOp(client, init, {
      kind: "turn",
      payload: {
        actor: "pk0",
        offerId: "o",
        offerType: "obp.frame",
        ports: [{ id: "p", isTerminal: false, max_bindings: 1.5 }],
      },
    }),
  ).toThrow(ObpError);
});
