import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { evaluateComposable } from "@cfd/agent-identity";
import { ObpClient } from "@cfd/obp-core";
import { createObpSqlitePersistence, OBP_SCHEMA_SQL } from "@cfd/obp-sqlite";
import { obpBindPortTool } from "./bind-port-tool.ts";
import { obpEndNegotiationTool } from "./end-negotiation-tool.ts";
import { obpExposePortTool } from "./expose-port-tool.ts";
import { obpExtendOfferTool } from "./extend-offer-tool.ts";
import {
  captureNegotiationEndFromToolExecuted,
  computeNegotiationContext,
} from "./negotiation-context.ts";
import { obpToolkit } from "./obp-toolkit.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";
import { buildObpToolkitContext, buildObpToolRuntimeContext } from "./toolkit-context.ts";

function mkEnv(
  client: ObpClient,
  overrides: Partial<ObpToolkitEnv> & Pick<ObpToolkitEnv, "actingPartyId">,
): ObpToolkitEnv {
  return {
    ledgerSeq: () => 0,
    validateBind: undefined,
    ...overrides,
    client,
  };
}

describe("obp tools", () => {
  test("obp_extend_offer uses env actingPartyId", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 0 });
    const { party } = client.registerParty({ name: "p1", sourcemaps: [] });
    const env = mkEnv(client, { actingPartyId: party.id });
    const { tools } = await obpExtendOfferTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_extend_offer;
    const out = (await spec.handler(buildObpToolRuntimeContext({ env }), {
      offerType: "public_text",
    })) as { offerId: string };
    expect(out.offerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(client.getExtendingPartyId(out.offerId)).toBe(party.id);
  });

  test("obp_extend_offer respects expires_after_seq", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 1_000_000 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 1_000_000 });
    const { party } = client.registerParty({ name: "p1", sourcemaps: [] });
    const env = mkEnv(client, { actingPartyId: party.id, ledgerSeq: () => 1_000_000 });
    const { tools } = await obpExtendOfferTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_extend_offer;
    const out = (await spec.handler(buildObpToolRuntimeContext({ env }), {
      offerType: "t",
      expires_after_seq: 48,
    })) as { offerId: string };
    const o = client.getOffer(out.offerId);
    expect(o.kind).toBe("found");
    if (o.kind === "found") {
      expect(o.offer.expires_seq).toBe(1_000_000 + 48);
    }
  });

  test("obp_expose_port rejects offer not owned by acting party", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 0 });
    const { party: seller } = client.registerParty({ name: "s", sourcemaps: [] });
    const { party: buyer } = client.registerParty({ name: "b", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: seller.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: 0,
        expires_seq: 86_400_000,
        type: "public_text",
        sourcemaps: [],
      },
    });
    const env = mkEnv(client, { actingPartyId: buyer.id });
    const { tools } = await obpExposePortTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_expose_port;
    await expect(
      spec.handler(buildObpToolRuntimeContext({ env }), {
        offerId: offer.id,
        portType: "public_text",
        promise: "Buyer should not expose here.",
        terminal: false,
      }),
    ).rejects.toThrow(/not owned/);
  });

  test("obp_bind_port allows non-terminal exposed port", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 0 });
    const { party: seller } = client.registerParty({ name: "s", sourcemaps: [] });
    const { party: buyer } = client.registerParty({ name: "b", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: seller.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: 0,
        expires_seq: 86_400_000,
        type: "public_text",
        sourcemaps: [],
      },
    });
    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        created_seq: 0,
        expires_seq: 86_400_000,
        type: "branch",
        promise: "Branch affordance.",
        max_bindings: 1,
        terminal: false,
        ref: "",
        sourcemaps: [],
      },
    });
    const env = mkEnv(client, { actingPartyId: buyer.id });
    const { tools } = await obpBindPortTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_bind_port;
    const out = (await spec.handler(buildObpToolRuntimeContext({ env }), {
      offerId: offer.id,
      portId: port.id,
    })) as { offerId: string; portId: string };
    expect(out.portId).toBe(port.id);
  });

  test("obp_bind_port rejects when validateBind throws (e.g. wrong actor)", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 0 });
    const { party } = client.registerParty({ name: "s", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: 0,
        expires_seq: 86_400_000,
        type: "public_text",
        sourcemaps: [],
      },
    });
    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        created_seq: 0,
        expires_seq: 86_400_000,
        type: "demo.deal.v1|p=55",
        promise: "Terminal deal port.",
        max_bindings: 1,
        terminal: true,
        ref: "",
        sourcemaps: [],
      },
    });
    const env = mkEnv(client, {
      actingPartyId: party.id,
      validateBind: () => {
        throw new Error("obp_bind_port: only the buyer may bind");
      },
    });
    const { tools } = await obpBindPortTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_bind_port;
    await expect(
      spec.handler(buildObpToolRuntimeContext({ env }), {
        offerId: offer.id,
        portId: port.id,
      }),
    ).rejects.toThrow(/buyer/);
  });

  test("obp_end_negotiation invokes requestNegotiationEnd", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 0 });
    const { party } = client.registerParty({ name: "p", sourcemaps: [] });
    let end: { reason?: string } | undefined;
    const env = mkEnv(client, {
      actingPartyId: party.id,
      requestNegotiationEnd: (args) => {
        end = args;
      },
    });
    const { tools } = await obpEndNegotiationTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_end_negotiation;
    await spec.handler(buildObpToolRuntimeContext({ env }), { reason: "done" });
    expect(end).toEqual({ reason: "done" });
  });

  test("obpToolkit exposes dynamic bind and revoke tools from negotiationToolContext", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 100 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 100 });
    const { party: seller } = client.registerParty({ name: "s", sourcemaps: [] });
    const { party: buyer } = client.registerParty({ name: "b", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: seller.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: 100,
        expires_seq: 86_400_000,
        type: "intro",
        sourcemaps: [],
      },
    });
    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        created_seq: 100,
        expires_seq: 86_400_000,
        type: "accept",
        promise: "Accept offer (terminal).",
        max_bindings: 1,
        terminal: true,
        ref: "",
        sourcemaps: [],
      },
    });

    const buyerCtx = await computeNegotiationContext({
      client,
      persistence,
      actingPartyId: buyer.id,
      ledgerSeq: 100,
      validateBind: undefined,
    });
    const buyerEnv = mkEnv(client, {
      actingPartyId: buyer.id,
      ledgerSeq: () => 100,
      negotiationToolContext: buyerCtx,
    });
    const buyerEval = await evaluateComposable(
      obpToolkit,
      buildObpToolkitContext({ env: buyerEnv }),
    );
    expect(Object.keys(buyerEval.tools)).toContain(`obp_bind__${port.id}`);

    const sellerCtx = await computeNegotiationContext({
      client,
      persistence,
      actingPartyId: seller.id,
      ledgerSeq: 100,
      validateBind: undefined,
    });
    const sellerEnv = mkEnv(client, {
      actingPartyId: seller.id,
      ledgerSeq: () => 100,
      negotiationToolContext: sellerCtx,
    });
    const sellerEval = await evaluateComposable(
      obpToolkit,
      buildObpToolkitContext({ env: sellerEnv }),
    );
    expect(Object.keys(sellerEval.tools)).toContain(`obp_revoke_port__${port.id}`);
    expect(Object.keys(sellerEval.tools)).toContain(`obp_revoke_offer__${offer.id}`);
  });

  test("computeNegotiationContext omits revoke tools when offer or port has a bind", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 100 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 100 });
    const { party: seller } = client.registerParty({ name: "s", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: seller.id,
      bindPortId: "",
      offer: {
        id: "",
        created_seq: 100,
        expires_seq: 86_400_000,
        type: "intro",
        sourcemaps: [],
      },
    });
    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        created_seq: 100,
        expires_seq: 86_400_000,
        type: "accept",
        promise: "Accept offer (terminal).",
        max_bindings: 1,
        terminal: true,
        ref: "",
        sourcemaps: [],
      },
    });

    client.bindPort({ offerId: offer.id, portId: port.id });

    const sellerCtx = await computeNegotiationContext({
      client,
      persistence,
      actingPartyId: seller.id,
      ledgerSeq: 100,
      validateBind: undefined,
    });
    expect(sellerCtx.revokePortChoices.map((c) => c.portId)).not.toContain(port.id);
    expect(sellerCtx.revokeOfferChoices.map((c) => c.offerId)).not.toContain(offer.id);
  });

  test("captureNegotiationEndFromToolExecuted records successful obp_end_negotiation", () => {
    const out = { current: null as { reason?: string } | null };
    captureNegotiationEndFromToolExecuted(
      { ok: true, toolName: "obp_end_negotiation", input: { reason: "done" } },
      out,
    );
    expect(out.current).toEqual({ reason: "done" });
  });

  test("getExtendingPartyId returns null for unknown offer", () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { ledgerSeq: () => 0 });
    const client = new ObpClient(persistence, { ledgerSeq: () => 0 });
    expect(client.getExtendingPartyId("00000000-0000-4000-8000-000000000099")).toBeNull();
  });
});
