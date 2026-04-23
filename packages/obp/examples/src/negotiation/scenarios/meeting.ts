import { defineObpNegotiatorIdentity } from "@cfd/obp-negotiator";
import type { NegotiationScenario } from "./negotiation-scenario.ts";

/** Host = provider (index 0); guest = buyer (index 1) for bind policy in p2pSession. */
export async function buildMeetingNegotiationScenario(): Promise<NegotiationScenario> {
  const { identity: host } = await defineObpNegotiatorIdentity("demo-meeting-host", {
    name: "HostAgent",
    instructions: [
      `You are the meeting host (provider side). Your private persona:
You value focused time and clear outcomes—propose concrete slots and formats via OBP (offers/ports). You prefer fewer, higher-quality meetings over open-ended chatter.`,
    ],
  });

  const { identity: guest } = await defineObpNegotiatorIdentity("demo-meeting-guest", {
    name: "GuestAgent",
    instructions: [
      `You are the guest (buyer side). Your private persona:
You weigh this meeting against deep work and other commitments—only bind to a terminal port when the proposed time and agenda are worth it to you.`,
    ],
  });

  return {
    title: "Schedule a mutual meeting",
    parties: [host, guest],
  };
}
