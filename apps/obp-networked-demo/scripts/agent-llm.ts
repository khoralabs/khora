import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AgentRegistry, RegisteredAgentIdentity } from "@cfd/agent-identity";
import {
  type NegotiationTurnAudit,
  runStructuredNegotiatorTurn,
  type TurnContract,
} from "@cfd/obp-agent-runtime";
import type { TurnBody } from "@cfd/obp-core";
import type { LanguageModel } from "ai";

/** Matches `packages/obp/agents/runtime/examples/shared/negotiation-timeouts.ts`. */
export const NEGOTIATION_LLM_TURN_BUDGET_MS = 300_000;

export function resolveGeminiApiKey(): string {
  const k =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "Set GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) for the agent demo.",
    );
  }
  return k;
}

let google: ReturnType<typeof createGoogleGenerativeAI> | undefined;

export function getNegotiationModel(): LanguageModel {
  if (!google) {
    google = createGoogleGenerativeAI({ apiKey: resolveGeminiApiKey() });
  }
  const id = process.env.OBP_NEGOTIATION_MODEL?.trim() || "gemini-flash-lite-latest";
  return google.languageModel(id);
}

export function resolveDemoTurnBudgetMs(): number {
  const raw = process.env.OBP_AGENT_TURN_BUDGET_MS?.trim();
  if (raw === undefined || raw === "") return NEGOTIATION_LLM_TURN_BUDGET_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : NEGOTIATION_LLM_TURN_BUDGET_MS;
}

export {
  negotiationShouldEnd,
  preparedToNegotiatorTurn,
  terminalAgreement,
} from "@cfd/obp-agent-runtime";

/**
 * Demo wrapper: Gemini model + env budget around {@link runStructuredNegotiatorTurn}.
 */
export async function runNegotiatorContractTurn(
  registry: AgentRegistry,
  identity: RegisteredAgentIdentity,
  contract: TurnContract<NegotiationTurnAudit>,
  partyId: string,
): Promise<{ audit: NegotiationTurnAudit; raw: unknown; turn: TurnBody }> {
  return runStructuredNegotiatorTurn({
    registry,
    identity,
    contract,
    partyId,
    model: getNegotiationModel(),
    budgetMs: resolveDemoTurnBudgetMs(),
  });
}
