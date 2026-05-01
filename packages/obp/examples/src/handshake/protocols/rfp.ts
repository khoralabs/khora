/**
 * RFP → bids → award: buyer publishes RFP; sellers expose competing terminal award ports; buyer binds one winner.
 */
import type { ObpClient } from "@cfd/obp-core";
import { logStep, shortId } from "../log.ts";
import { DEMO_EXPIRY_MS, DEMO_TS, type DemoStack } from "../stack.ts";

export function runRfpAward(stack: DemoStack): void {
  const { client } = stack;
  const ts = DEMO_TS;

  logStep("RFP / parties");
  const { party: buyer } = client.registerParty({ name: "Buyer", sourcemaps: [] });
  const { party: seller1 } = client.registerParty({ name: "Seller1", sourcemaps: [] });
  const { party: seller2 } = client.registerParty({ name: "Seller2", sourcemaps: [] });

  logStep("1 · Buyer · extendOffer (RFP)");
  const { offer: rfpOffer } = client.extendOffer({
    partyId: buyer.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|rfp|id=rfp-001",
      sourcemaps: [],
    },
  });
  console.log(`   RFP ${shortId(rfpOffer.id)}`);

  logStep("2 · Sellers · bid offers + terminal award ports");
  const { offer: bid1 } = client.extendOffer({
    partyId: seller1.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|bid|seller=1|amount=9000",
      sourcemaps: [],
    },
  });
  const { port: award1 } = client.exposePort({
    offerId: bid1.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|award",
      description: "Buyer may bind to award this bid.",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const { offer: bid2 } = client.extendOffer({
    partyId: seller2.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|bid|seller=2|amount=8500",
      sourcemaps: [],
    },
  });
  const { port: award2 } = client.exposePort({
    offerId: bid2.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|award",
      description: "Buyer may bind to award this bid.",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  console.log(
    `   S1 ${shortId(bid1.id)} / ${shortId(award1.id)}   S2 ${shortId(bid2.id)} / ${shortId(award2.id)}`,
  );

  logStep("3 · Buyer · bindPort → Seller1 award (winner)");
  client.bindPort({ offerId: bid1.id, portId: award1.id });
  console.log(`   awarded ${shortId(bid1.id)} (Seller2 port remains unbound)`);
}

export function runRfpAwardCore(client: ObpClient): { winnerOfferId: string; loserPortId: string } {
  const ts = DEMO_TS;
  const { party: buyer } = client.registerParty({ name: "Buyer", sourcemaps: [] });
  const { party: seller1 } = client.registerParty({ name: "Seller1", sourcemaps: [] });
  const { party: seller2 } = client.registerParty({ name: "Seller2", sourcemaps: [] });

  client.extendOffer({
    partyId: buyer.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|rfp",
      sourcemaps: [],
    },
  });

  const { offer: bid1 } = client.extendOffer({
    partyId: seller1.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|bid|seller=1",
      sourcemaps: [],
    },
  });
  const { port: award1 } = client.exposePort({
    offerId: bid1.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|award",
      description: "Buyer may bind to award this bid.",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const { offer: bid2 } = client.extendOffer({
    partyId: seller2.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|bid|seller=2",
      sourcemaps: [],
    },
  });
  const { port: award2 } = client.exposePort({
    offerId: bid2.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.rfp.v1|award",
      description: "Buyer may bind to award this bid.",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: bid1.id, portId: award1.id });
  return { winnerOfferId: bid1.id, loserPortId: award2.id };
}
