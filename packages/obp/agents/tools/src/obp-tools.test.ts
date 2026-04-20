import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { ObpClient } from "@cfd/obp-core";
import { createObpSqlitePersistence, OBP_SCHEMA_SQL } from "@cfd/obp-sqlite";
import { obpBindPortTool } from "./bind-port-tool.ts";
import { obpEndNegotiationTool } from "./end-negotiation-tool.ts";
import { obpExposePortTool } from "./expose-port-tool.ts";
import { obpExtendOfferTool } from "./extend-offer-tool.ts";
import { expiresAtFromHours } from "./obp-tool-defaults.ts";
import type { ObpToolkitEnv } from "./obp-toolkit-env.ts";
import { buildObpToolkitContext, buildObpToolRuntimeContext } from "./toolkit-context.ts";

function mkEnv(
  client: ObpClient,
  overrides: Partial<ObpToolkitEnv> & Pick<ObpToolkitEnv, "actingPartyId">,
): ObpToolkitEnv {
  return {
    now: () => 0,
    validateBind: undefined,
    ...overrides,
    client,
  };
}

describe("obp tools", () => {
  test("obp_extend_offer uses env actingPartyId", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { now: () => 0 });
    const client = new ObpClient(persistence, { now: () => 0 });
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

  test("obp_extend_offer respects expiresAfterHours", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { now: () => 1_000_000 });
    const client = new ObpClient(persistence, { now: () => 1_000_000 });
    const { party } = client.registerParty({ name: "p1", sourcemaps: [] });
    const env = mkEnv(client, { actingPartyId: party.id, now: () => 1_000_000 });
    const { tools } = await obpExtendOfferTool.evaluate(buildObpToolkitContext({ env }));
    const spec = tools.obp_extend_offer;
    const out = (await spec.handler(buildObpToolRuntimeContext({ env }), {
      offerType: "t",
      expiresAfterHours: 48,
    })) as { offerId: string };
    const o = client.getOffer(out.offerId);
    expect(o.kind).toBe("found");
    if (o.kind === "found") {
      expect(o.offer.ts_expired).toBe(expiresAtFromHours(1_000_000, 48));
    }
  });

  test("obp_expose_port rejects offer not owned by acting party", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { now: () => 0 });
    const client = new ObpClient(persistence, { now: () => 0 });
    const { party: seller } = client.registerParty({ name: "s", sourcemaps: [] });
    const { party: buyer } = client.registerParty({ name: "b", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: seller.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: 0,
        ts_expired: 86_400_000,
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
        terminal: false,
      }),
    ).rejects.toThrow(/not owned/);
  });

  test("obp_bind_port rejects when validateBind throws (e.g. wrong actor)", async () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { now: () => 0 });
    const client = new ObpClient(persistence, { now: () => 0 });
    const { party } = client.registerParty({ name: "s", sourcemaps: [] });
    const { offer } = client.extendOffer({
      partyId: party.id,
      bindPortId: "",
      offer: {
        id: "",
        ts_created: 0,
        ts_expired: 86_400_000,
        type: "public_text",
        sourcemaps: [],
      },
    });
    const { port } = client.exposePort({
      offerId: offer.id,
      port: {
        id: "",
        ts_created: 0,
        ts_expired: 86_400_000,
        type: "demo.deal.v1|p=55",
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
    const persistence = createObpSqlitePersistence(db, { now: () => 0 });
    const client = new ObpClient(persistence, { now: () => 0 });
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

  test("getExtendingPartyId returns null for unknown offer", () => {
    const db = new Database(":memory:");
    db.run(OBP_SCHEMA_SQL);
    const persistence = createObpSqlitePersistence(db, { now: () => 0 });
    const client = new ObpClient(persistence, { now: () => 0 });
    expect(client.getExtendingPartyId("00000000-0000-4000-8000-000000000099")).toBeNull();
  });
});
