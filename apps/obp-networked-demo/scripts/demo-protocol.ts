import type { PortBindPolicy } from "@cfd/obp-core";

/** Shared multi-turn demo: two responder proliferates then terminate after second bind. */
export const demoBindPolicy: PortBindPolicy = {
  version: "1",
  properties: [{ type: "boolean", name: "Agree", prompt: "Accept terms" }],
};

export const demoTurn1 = { offerId: "demo-turn-1", portId: "main" as const };
export const demoTurn2 = { offerId: "demo-turn-2", portId: "follow" as const };

export function demoCounterpartyPayload(): Record<string, unknown> {
  return { agree: true };
}
