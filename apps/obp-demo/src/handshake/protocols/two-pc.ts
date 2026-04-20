/**
 * Simplified 2PC: coordinator + two participants prepare, then commit or abort via terminal ports.
 */
import type { ObpClient } from "@cfd/obp-core";
import { DEMO_EXPIRY_MS, DEMO_TS, type DemoStack } from "../stack.ts";
import { logStep, shortId } from "../log.ts";

export type TwoPcOutcome = "commit" | "abort";

export function runTwoPhaseCommit(stack: DemoStack, outcome: TwoPcOutcome): void {
  const { client } = stack;
  const ts = DEMO_TS;

  logStep("2PC / parties");
  const { party: coordinator } = client.registerParty({ name: "Coordinator", sourcemaps: [] });
  const { party: p1 } = client.registerParty({ name: "Participant1", sourcemaps: [] });
  const { party: p2 } = client.registerParty({ name: "Participant2", sourcemaps: [] });

  logStep("1 · Coordinator · extendOffer (transaction root)");
  const { offer: txnOffer } = client.extendOffer({
    partyId: coordinator.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|txn",
      sourcemaps: [],
    },
  });
  console.log(`   txn ${shortId(txnOffer.id)}`);

  logStep("2 · Participants · prepared votes (non-terminal ports)");
  const { offer: o1 } = client.extendOffer({
    partyId: p1.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|participant",
      sourcemaps: [],
    },
  });
  const { port: vote1 } = client.exposePort({
    offerId: o1.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|prepared",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  const { offer: o2 } = client.extendOffer({
    partyId: p2.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|participant",
      sourcemaps: [],
    },
  });
  const { port: vote2 } = client.exposePort({
    offerId: o2.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|prepared",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  console.log(`   P1 ${shortId(o1.id)} / ${shortId(vote1.id)}  P2 ${shortId(o2.id)} / ${shortId(vote2.id)}`);

  logStep("3 · Coordinator · bindPort (record prepared on both)");
  client.bindPort({ offerId: o1.id, portId: vote1.id });
  client.bindPort({ offerId: o2.id, portId: vote2.id });

  logStep("4 · Coordinator · outcome offer · commit + abort terminals");
  const { offer: outcomeOffer } = client.extendOffer({
    partyId: coordinator.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|outcome",
      sourcemaps: [],
    },
  });
  const { port: commitPort } = client.exposePort({
    offerId: outcomeOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|commit",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const { port: abortPort } = client.exposePort({
    offerId: outcomeOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|abort",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  console.log(
    `   outcome ${shortId(outcomeOffer.id)} commit ${shortId(commitPort.id)} abort ${shortId(abortPort.id)}`,
  );

  logStep(`5 · Coordinator · bindPort → ${outcome.toUpperCase()}`);
  if (outcome === "commit") {
    client.bindPort({ offerId: outcomeOffer.id, portId: commitPort.id });
  } else {
    client.bindPort({ offerId: outcomeOffer.id, portId: abortPort.id });
  }
}

export function runTwoPhaseCommitCore(client: ObpClient, outcome: TwoPcOutcome): void {
  const ts = DEMO_TS;
  const { party: coordinator } = client.registerParty({ name: "Coordinator", sourcemaps: [] });
  const { party: p1 } = client.registerParty({ name: "Participant1", sourcemaps: [] });
  const { party: p2 } = client.registerParty({ name: "Participant2", sourcemaps: [] });

  client.extendOffer({
    partyId: coordinator.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|txn",
      sourcemaps: [],
    },
  });

  const { offer: o1 } = client.extendOffer({
    partyId: p1.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|participant",
      sourcemaps: [],
    },
  });
  const { port: vote1 } = client.exposePort({
    offerId: o1.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|prepared",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  const { offer: o2 } = client.extendOffer({
    partyId: p2.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|participant",
      sourcemaps: [],
    },
  });
  const { port: vote2 } = client.exposePort({
    offerId: o2.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|prepared",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: o1.id, portId: vote1.id });
  client.bindPort({ offerId: o2.id, portId: vote2.id });

  const { offer: outcomeOffer } = client.extendOffer({
    partyId: coordinator.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|outcome",
      sourcemaps: [],
    },
  });
  const { port: commitPort } = client.exposePort({
    offerId: outcomeOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|commit",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  const { port: abortPort } = client.exposePort({
    offerId: outcomeOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.2pc.v1|abort",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  if (outcome === "commit") {
    client.bindPort({ offerId: outcomeOffer.id, portId: commitPort.id });
  } else {
    client.bindPort({ offerId: outcomeOffer.id, portId: abortPort.id });
  }
}
