import type { ObpClient, ObpPersistence } from "@cfd/obp-core";
import { type ObpToolkitEnv, type PriceBand, priceInZone } from "@cfd/obp-tools";
import type { LanguageModel } from "ai";
import type { ObpLlmAgents } from "../agents/buildObpNegotiationAgents.ts";
import { buildObpNegotiationAgents } from "../agents/buildObpNegotiationAgents.ts";
import { createDemoStack } from "../obp/demoPersistence.ts";
import { agentSourcemaps } from "../obp/sourcemaps.ts";
import { createObpNegotiationToolLoopAgent } from "./createObpNegotiationToolLoopAgent.ts";
import { parseDealPackage } from "./encoding.ts";
import { getNegotiationModel } from "./env.ts";
import {
  DEFAULT_NEGOTIATION_GOALS,
  goalsToPriceBand,
  type NegotiationGoals,
  termInZone,
} from "./goals.ts";
import { formatSnapshotForPrompt, loadGraphSnapshot } from "./obpSnapshot.ts";
import { logGeneration, logObserverHeader } from "./observer.ts";
import { systemPromptForBuyer, systemPromptForSeller, userPromptTurn } from "./prompts.ts";

export type LlmNegotiationResult =
  | { status: "deal"; price: number; termMonths: number; rounds: number }
  | { status: "exhausted"; rounds: number }
  | { status: "error"; message: string };

const MAX_ROUNDS = 16;

function findCompletedDeal(
  client: ObpClient,
  persistence: ObpPersistence,
  sellerPartyId: string,
  band: PriceBand,
  goals: NegotiationGoals,
): { price: number; termMonths: number } | null {
  for (const b of persistence.listBinds()) {
    if (client.getExtendingPartyId(b.offerId) !== sellerPartyId) {
      continue;
    }
    const pr = client.getPort(b.portId);
    if (pr.kind === "notFound") {
      continue;
    }
    if (!pr.port.terminal) {
      continue;
    }
    const pkg = parseDealPackage(pr.port.type);
    if (pkg === null) {
      continue;
    }
    if (!priceInZone(pkg.price, band) || !termInZone(pkg.termMonths, goals)) {
      continue;
    }
    return pkg;
  }
  return null;
}

export async function runLlmNegotiation(options?: {
  goals?: NegotiationGoals;
  maxRounds?: number;
  agents?: ObpLlmAgents;
}): Promise<LlmNegotiationResult> {
  const goals: NegotiationGoals = options?.goals ?? DEFAULT_NEGOTIATION_GOALS;
  const band = goalsToPriceBand(goals);
  const maxRounds = options?.maxRounds ?? MAX_ROUNDS;

  let model: LanguageModel;
  try {
    model = getNegotiationModel();
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const built = options?.agents ?? (await buildObpNegotiationAgents());

  const stack = createDemoStack();
  const { client, db, persistence } = stack;
  const now = stack.now;

  const { party: buyerParty } = client.registerParty({
    name: built.buyer.name,
    sourcemaps: agentSourcemaps(built.buyer),
  });
  const { party: sellerParty } = client.registerParty({
    name: built.seller.name,
    sourcemaps: agentSourcemaps(built.seller),
  });

  const buyerPartyId = buyerParty.id;
  const sellerPartyId = sellerParty.id;

  logObserverHeader("LLM OBP negotiation (observer: ToolLoopAgent + OBP tools)");
  console.log("[observer] buyerPartyId", buyerPartyId);
  console.log("[observer] sellerPartyId", sellerPartyId);
  console.log("[observer] goals (human-only context in logs; not given to peer)", goals);

  try {
    for (let round = 0; round < maxRounds; round++) {
      const role = round % 2 === 0 ? "seller" : "buyer";
      const snapshot = loadGraphSnapshot(db);
      const graphText = formatSnapshotForPrompt(snapshot);
      const user = userPromptTurn(graphText);

      const identity = role === "seller" ? built.seller : built.buyer;
      const system = role === "seller" ? systemPromptForSeller(goals) : systemPromptForBuyer(goals);

      const actingPartyId = role === "seller" ? sellerPartyId : buyerPartyId;

      const env: ObpToolkitEnv = {
        client,
        now,
        actingPartyId,
        validateBind: async (ctx) => {
          if (ctx.actingPartyId !== buyerPartyId) {
            throw new Error("obp_bind_port: only the buyer may bind");
          }
          if (ctx.offerOwnerPartyId !== sellerPartyId) {
            throw new Error("obp_bind_port: must bind to the seller's offer");
          }
          const pkg = parseDealPackage(ctx.port.type);
          if (pkg === null) {
            throw new Error(
              "obp_bind_port: terminal deal ports must use demo.deal.v2|p=<price>|s=<termMonths>",
            );
          }
          if (!priceInZone(pkg.price, band)) {
            throw new Error(
              `obp_bind_port: price ${pkg.price} outside mutual zone [${goals.sellerMin}, ${goals.buyerMax}]`,
            );
          }
          if (!termInZone(pkg.termMonths, goals)) {
            throw new Error(
              `obp_bind_port: term ${pkg.termMonths} months outside mutual zone [${goals.sellerMinTermMonths}, ${goals.buyerMaxTermMonths}]`,
            );
          }
        },
      };

      const agent = await createObpNegotiationToolLoopAgent({
        model,
        identity,
        env,
        systemInstructions: system,
        maxSteps: 8,
      });

      const generation = await agent.generate({ prompt: user });
      logGeneration({ round, role, system, user, generation });

      const deal = findCompletedDeal(client, persistence, sellerPartyId, band, goals);
      if (deal !== null) {
        return {
          status: "deal",
          price: deal.price,
          termMonths: deal.termMonths,
          rounds: round + 1,
        };
      }
    }
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  return { status: "exhausted", rounds: maxRounds };
}
