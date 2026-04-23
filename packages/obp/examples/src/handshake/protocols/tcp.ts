/**
 * TCP-like three-way handshake (metaphor): SYN → SYN-ACK → ACK.
 * A extends SYN; B extends an offer and exposes SYN-ACK (non-terminal); A binds.
 * B exposes ACK (terminal) on the same offer; A binds → connection established.
 */
import type { ObpClient } from "@cfd/obp-core";
import { logStep, shortId } from "../log.ts";
import { DEMO_EXPIRY_MS, DEMO_TS, type DemoStack } from "../stack.ts";

export function runThreeWayTcp(stack: DemoStack): void {
  const { client } = stack;
  const ts = DEMO_TS;

  logStep("TCP-like / parties");
  const { party: initiator } = client.registerParty({ name: "Initiator", sourcemaps: [] });
  const { party: responder } = client.registerParty({ name: "Responder", sourcemaps: [] });

  logStep("1 · Initiator · extendOffer (SYN)");
  const { offer: synOffer } = client.extendOffer({
    partyId: initiator.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|syn|seq=100",
      sourcemaps: [],
    },
  });
  console.log(`   offer ${shortId(synOffer.id)}`, synOffer.type);

  logStep("2 · Responder · extendOffer + exposePort (SYN-ACK, non-terminal)");
  const { offer: responderOffer } = client.extendOffer({
    partyId: responder.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|responder",
      sourcemaps: [],
    },
  });
  const { port: synAckPort } = client.exposePort({
    offerId: responderOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|syn-ack|ack=101",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  console.log(`   offer ${shortId(responderOffer.id)} port ${shortId(synAckPort.id)}`);

  logStep("3 · Initiator · bindPort → SYN-ACK");
  client.bindPort({ offerId: responderOffer.id, portId: synAckPort.id });
  console.log(`   bind (${shortId(responderOffer.id)}, ${shortId(synAckPort.id)})`);

  logStep("4 · Responder · exposePort (ACK, terminal)");
  const { port: ackPort } = client.exposePort({
    offerId: responderOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|ack|established",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  console.log(`   port ${shortId(ackPort.id)} terminal=true`);

  logStep("5 · Initiator · bindPort → ACK (connection established)");
  client.bindPort({ offerId: responderOffer.id, portId: ackPort.id });
  console.log(`   bind (${shortId(responderOffer.id)}, ${shortId(ackPort.id)})`);
}

/** Exported for tests: run same steps without console noise. */
export function runThreeWayTcpCore(client: ObpClient): void {
  const ts = DEMO_TS;
  const { party: initiator } = client.registerParty({ name: "Initiator", sourcemaps: [] });
  const { party: responder } = client.registerParty({ name: "Responder", sourcemaps: [] });
  const { offer: _synOffer } = client.extendOffer({
    partyId: initiator.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|syn|seq=100",
      sourcemaps: [],
    },
  });
  void _synOffer;
  const { offer: responderOffer } = client.extendOffer({
    partyId: responder.id,
    bindPortId: "",
    offer: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|responder",
      sourcemaps: [],
    },
  });
  const { port: synAckPort } = client.exposePort({
    offerId: responderOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|syn-ack",
      max_bindings: 1,
      terminal: false,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: responderOffer.id, portId: synAckPort.id });
  const { port: ackPort } = client.exposePort({
    offerId: responderOffer.id,
    port: {
      id: "",
      ts_created: ts,
      ts_expired: ts + DEMO_EXPIRY_MS,
      type: "demo.tcp.v1|ack",
      max_bindings: 1,
      terminal: true,
      ref: "",
      sourcemaps: [],
    },
  });
  client.bindPort({ offerId: responderOffer.id, portId: ackPort.id });
}
