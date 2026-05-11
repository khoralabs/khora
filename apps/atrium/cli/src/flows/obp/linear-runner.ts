import type { OBPPersistenceClient, Offer, Party, Port, PortBindPolicy } from "@cfd/obp-core";
import { type ReadLineFn, readBindPolicyInteractive } from "./bind-readline.ts";
import { mergePortShell, shellOffer } from "./port-defaults.ts";

export type CliLinearTransition = {
  /** Key for aggregation maps */
  stepId: string;
  /** Offer type minted when this transition completes */
  nextOfferType: string;
  /** Shown before prompts; also `Port.promise` */
  title: string;
  bindPolicy: PortBindPolicy;
  /** When true, `Port.terminal` is set (OBP hint only; runner stops after this transition). */
  terminal?: boolean;
};

export type RunLinearObpFlowResult = {
  client: OBPPersistenceClient;
  party: Party;
  bindsByStep: Record<string, Record<string, unknown>>;
  finalOffer: Offer;
};

/**
 * Single-party linear DAG: root offer, then each transition is exposePort → bind → extendOffer.
 */
export async function runLinearObpFlow(args: {
  obp: OBPPersistenceClient;
  partyName: string;
  rootOfferType: string;
  transitions: CliLinearTransition[];
  readLine: ReadLineFn;
}): Promise<RunLinearObpFlowResult> {
  const client = args.obp;
  const { party } = client.registerParty({ name: args.partyName, sourcemaps: [] });

  let { offer } = client.extendOffer({
    partyId: party.id,
    offer: shellOffer(args.rootOfferType),
    bindPortId: "",
  });

  const bindsByStep: Record<string, Record<string, unknown>> = {};

  for (const t of args.transitions) {
    const portPayload: Partial<Port> = {
      promise: t.title,
      bind_policy: t.bindPolicy,
      max_bindings: 1,
      terminal: t.terminal ?? false,
    };
    const { port } = client.exposePort({
      offerId: offer.id,
      port: mergePortShell(portPayload),
    });

    console.log(`\n── ${t.title} ──`);
    const bindPolicy = port.bind_policy;
    if (bindPolicy === undefined) {
      throw new Error(`exposePort missing bind_policy for transition "${t.stepId}"`);
    }
    const cb = await readBindPolicyInteractive(bindPolicy, args.readLine);
    bindsByStep[t.stepId] = cb;

    const next = client.extendOffer({
      partyId: party.id,
      bindPortId: port.id,
      counterparty_bind: cb,
      offer: shellOffer(t.nextOfferType),
    });
    offer = next.offer;
  }

  return { client, party, bindsByStep, finalOffer: offer };
}
