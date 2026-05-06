import { expect, test } from "bun:test";
import { FakeObpPersistence } from "../testing/fake-obp-persistence.ts";
import { ObpError } from "../persistence/client/errors.ts";
import { OBPPersistenceClient } from "../persistence/client/obp-persistence-client.ts";
import { applySessionOp, applySessionOps } from "./replay-session-ops.ts";
import type { SessionOp } from "./to-session-op.ts";
import type { SessionInit } from "./types.ts";

function setupParties() {
  let seq = 0;
  const ledgerSeq = () => ++seq;
  const persistence = new FakeObpPersistence(ledgerSeq);
  const responder = persistence.registerParty({ name: "srv", sourcemaps: [] }).party;
  const initiator = persistence.registerParty({ name: "cli", sourcemaps: [] }).party;
  const client = new OBPPersistenceClient(persistence, { ledgerSeq });
  const init: SessionInit = {
    session_id: "sid",
    party_ids: [responder.id, initiator.id],
    actor_pubkeys: ["pk0", "pk1"],
    genesis_hash: "0".repeat(64),
  };
  return { persistence, client, init, ledgerSeq };
}

test("applySessionOps: proliferate then resolve", () => {
  const { persistence, client, init } = setupParties();
  const ops: SessionOp[] = [
    {
      kind: "proliferate",
      payload: {
        offerId: "greeting",
        ports: [{ id: "p1", isTerminal: false }],
      },
    },
    {
      kind: "resolve",
      payload: { offerId: "greeting", portId: "p1", payload: {} },
    },
  ];
  applySessionOps(client, init, ops);
  expect(persistence.isPortExposed("p1")).toBe(true);
  expect(persistence.listBinds().length).toBe(1);
  expect(persistence.listBinds()[0]?.portId).toBe("p1");
  expect(persistence.getExtendingPartyId("greeting")).toBe(init.party_ids[0]);
});

test("applySessionOps: terminate invokes hook only", () => {
  const { client, init } = setupParties();
  let terminated: string | undefined;
  applySessionOps(
    client,
    init,
    [{ kind: "terminate", payload: { reason: "bye", code: "c1" } }],
    { onTerminate: (r, c) => { terminated = `${r}:${c}`; } },
  );
  expect(terminated).toBe("bye:c1");
});

test("applySessionOp rejects unknown kind", () => {
  const { client, init } = setupParties();
  expect(() =>
    applySessionOp(client, init, { kind: "nope", payload: {} }),
  ).toThrow(ObpError);
});

test("applySessionOps: second resolve exceeds max_bindings (from proliferate defaults)", () => {
  const { client, init } = setupParties();
  const ops: SessionOp[] = [
    {
      kind: "proliferate",
      payload: {
        offerId: "o",
        ports: [{ id: "one_slot", isTerminal: false }],
      },
    },
    {
      kind: "resolve",
      payload: { offerId: "o", portId: "one_slot", payload: { a: 1 } },
    },
    {
      kind: "resolve",
      payload: { offerId: "o", portId: "one_slot", payload: { b: 2 } },
    },
  ];
  expect(() => applySessionOps(client, init, ops)).toThrow(ObpError);
});
