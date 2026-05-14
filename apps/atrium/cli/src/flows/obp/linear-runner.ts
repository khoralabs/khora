import type { JsonDocument, Offer, Party, Port } from "@khoralabs/obp-v2-model";
import type { PortBindPolicy } from "@khoralabs/obp-v2-nbc";
import type { ObpPersistenceClient } from "@khoralabs/obp-v2-persistence";
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
  /** When true, runner treats this as a terminal transition (last step semantics for callers). */
  terminal?: boolean;
  /** Skip this transition when predicate returns true (gets binds collected so far). */
  skipIf?: (bindsByStep: Record<string, Record<string, unknown>>) => boolean;
};

export type RunLinearObpFlowResult = {
  client: ObpPersistenceClient;
  party: Party;
  bindsByStep: Record<string, Record<string, unknown>>;
  finalOffer: Offer;
};

/**
 * Single-party linear DAG: root offer, then each transition is exposePort → extendOffer with bind_payload.
 */
export async function runLinearObpFlow(args: {
  obp: ObpPersistenceClient;
  partyName: string;
  rootOfferType: string;
  transitions: CliLinearTransition[];
  readLine: ReadLineFn;
}): Promise<RunLinearObpFlowResult> {
  const client = args.obp;
  const { party } = await client.registerParty({ name: args.partyName, sourcemaps: [] });

  let { offer } = await client.extendOffer({
    partyId: party.id,
    offer: shellOffer(args.rootOfferType),
    bindPortId: "",
    bind_payload: null,
  });

  const bindsByStep: Record<string, Record<string, unknown>> = {};

  for (const t of args.transitions) {
    if (t.skipIf?.(bindsByStep) === true) continue;
    const portPayload: Partial<Port> = {
      promise: t.title,
    };
    const { port } = await client.exposePort({
      offerId: offer.id,
      port: mergePortShell(portPayload),
    });

    console.log(`\n── ${t.title} ──`);
    const cb = await readBindPolicyInteractive(t.bindPolicy, args.readLine);
    bindsByStep[t.stepId] = cb;

    const next = await client.extendOffer({
      partyId: party.id,
      bindPortId: port.id,
      bind_payload: cb as JsonDocument,
      offer: shellOffer(t.nextOfferType),
    });
    offer = next.offer;
  }

  return { client, party, bindsByStep, finalOffer: offer };
}
