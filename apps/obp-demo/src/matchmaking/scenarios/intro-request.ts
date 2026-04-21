import { defineObpNegotiatorIdentity } from "@cfd/obp-negotiator";
import type { MatchmakingScenario } from "./matchmaking-scenario.ts";

export async function buildIntroRequestScenario(): Promise<MatchmakingScenario> {
  const { identity: requester } = await defineObpNegotiatorIdentity("demo-matchmaking-requester", {
    name: "RequesterAgent",
    instructions: [
      `You are requesting a professional intro. Be specific about why this connection matters and what you hope to learn or achieve.`,
      `Use OBP to publish a concrete proposal. A typical pattern (not required): extend a "meeting request" offer; expose a terminal port for accepting as proposed, a non-terminal port if you are open to a counter-proposal, and a terminal port for declining. Name port types however you like as long as they are legible in the graph snapshot.`,
    ],
  });

  const { identity: requestee } = await defineObpNegotiatorIdentity("demo-matchmaking-requestee", {
    name: "RequesteeAgent",
    instructions: [
      `Your time is limited. Evaluate whether this intro serves your current goals before committing.`,
      `Read the requester's offer and exposed ports from the graph. A typical response pattern (not required): bind the terminal port that matches your intent (accept or walk away). If you want different terms, bind a non-terminal counter-propose port if offered, extend your own counter-offer, and expose terminal ports for the requester to accept or decline your counter.`,
    ],
  });

  return {
    title: "Intro request (matchmaking)",
    parties: [requester, requestee],
    maxRounds: 12,
  };
}
