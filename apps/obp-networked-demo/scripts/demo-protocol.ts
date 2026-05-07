import type { PortBindPolicy } from "@cfd/obp-core";

/** Shared multi-turn demo: client opens with a port; server binds it and exposes two offers; client binds both. */
export const demoBindPolicy: PortBindPolicy = {
  version: "1",
  properties: [{ type: "boolean", name: "Agree", prompt: "Accept terms" }],
};

export const demoClientOffer = "demo-client-open" as const;
export const demoClientPort = "to-server" as const;
export const demoTurn1 = { offerId: "demo-turn-1", portId: "main" as const };
export const demoTurn2 = { offerId: "demo-turn-2", portId: "follow" as const };

/** Config for one logical “round” (one OBP chain). Use two rounds on one HTTP/2 stream via frame multiplex. */
export type DemoRoundConfig = {
  clientOffer: string;
  clientPort: string;
  turn1: { offerId: string; portId: string };
  turn2: { offerId: string; portId: string };
};

export const demoRound1: DemoRoundConfig = {
  clientOffer: demoClientOffer,
  clientPort: demoClientPort,
  turn1: demoTurn1,
  turn2: demoTurn2,
};

/** Second round: distinct offer/port ids so the same persistence store stays consistent. */
export const demoRound2: DemoRoundConfig = {
  clientOffer: "demo-client-open-r2",
  clientPort: "to-server-r2",
  turn1: { offerId: "demo-turn-1-r2", portId: "main-r2" },
  turn2: { offerId: "demo-turn-2-r2", portId: "follow-r2" },
};

export function demoCounterpartyPayload(): Record<string, unknown> {
  /** Key must match {@link bindPolicySlug} for `name: "Agree"` → `agree`. */
  return { agree: true };
}
