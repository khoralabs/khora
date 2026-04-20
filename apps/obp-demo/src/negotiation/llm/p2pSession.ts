import {
  createAgentRegistry,
  type RegisteredAgentIdentity,
  type SessionContext,
  type ToolPipelineHooks,
} from "@cfd/agent-identity";
import {
  InMemoryNegotiationContext,
  type NegotiationMessage,
  type ObpClient,
} from "@cfd/obp-core";
import { createObpNegotiatorAgent, type ObpNegotiatorGeneration } from "@cfd/obp-negotiator";
import type { ObpToolkitEnv } from "@cfd/obp-tools";
import type { LanguageModel } from "ai";
import type { Logger } from "pino";
import {
  appendTextTranscriptTurn,
  createRunLogger,
  initTextTranscript,
  textTranscriptPathFromJsonl,
} from "../logger.ts";
import { createDemoStack } from "../obp/demoPersistence.ts";
import { agentSourcemaps } from "../obp/sourcemaps.ts";
import { resolveCompletedDeal, type CompletedDeal } from "../deal-detection.ts";
import { buildDefaultNegotiationScenario, type NegotiationScenario } from "../scenarios/index.ts";
import { getNegotiationModel } from "./env.ts";
import { buildUserMessage } from "./messages.ts";
import { logGeneration, logObserverHeader, logRoundSummary } from "./observer.ts";

export type LlmNegotiationResult =
  | {
      status: "deal";
      offerId: string;
      portId: string;
      portType: string;
      rounds: number;
    }
  | { status: "terminated"; reason?: string; rounds: number }
  | { status: "exhausted"; rounds: number }
  | { status: "error"; message: string };

const MAX_ROUNDS = 16;

export type NegotiationTurnInput = {
  prompt: string;
};

/** Merged into AgentRegistry session context for {@link negotiationTurnRunner}. */
export type NegotiationSessionContext = SessionContext & {
  model: LanguageModel;
  client: ObpClient;
  now: () => number;
  providerPartyId: string;
  buyerPartyId: string;
  obpPartyIdByAgentId: Map<string, string>;
  toolPipelineHooks?: ToolPipelineHooks;
  requestNegotiationEnd?: (args: { reason?: string }) => void;
};

export { resolveCompletedDeal, type CompletedDeal };

function formatThreadForPrompt(
  messages: NegotiationMessage[],
  partyIdToDisplayName: ReadonlyMap<string, string>,
): string {
  if (messages.length === 0) {
    return "(no messages yet)";
  }
  const lines: string[] = [];
  for (const m of messages) {
    const who = partyIdToDisplayName.get(m.authorPartyId) ?? m.authorPartyId;
    const tag = m.kind === "text" ? "text" : "tool";
    lines.push(`[${tag}] ${who}: ${m.content}`);
  }
  return lines.join("\n");
}

function collectToolResultMap(
  step: ObpNegotiatorGeneration["steps"][number],
): Map<string, { output?: unknown; error?: unknown }> {
  const m = new Map<string, { output?: unknown; error?: unknown }>();
  const all = [
    ...(step.toolResults ?? []),
    ...(step.staticToolResults ?? []),
    ...(step.dynamicToolResults ?? []),
  ];
  for (const tr of all) {
    const r = tr as { toolCallId: string; type?: string; output?: unknown; error?: unknown };
    if (r.type === "tool-result") {
      m.set(r.toolCallId, { output: r.output });
    } else if (r.type === "tool-error") {
      m.set(r.toolCallId, { error: r.error });
    }
  }
  return m;
}

async function mirrorGenerationToThread(args: {
  generation: ObpNegotiatorGeneration;
  ctx: InMemoryNegotiationContext;
  authorPartyId: string;
}): Promise<void> {
  const { generation, ctx, authorPartyId } = args;
  for (const step of generation.steps) {
    const text = step.text?.trim();
    if (text) {
      await ctx.postMessage({ authorPartyId, kind: "text", content: text });
    }
    const resultById = collectToolResultMap(step);
    const calls = [
      ...(step.toolCalls ?? []),
      ...(step.staticToolCalls ?? []),
      ...(step.dynamicToolCalls ?? []),
    ];
    for (const tc of calls) {
      const c = tc as { toolCallId: string; toolName: string; input: unknown };
      const out = resultById.get(c.toolCallId);
      let summary: string;
      try {
        summary = `${c.toolName}(${JSON.stringify(c.input)})`;
      } catch {
        summary = `${c.toolName}(<unserializable input>)`;
      }
      await ctx.postMessage({
        authorPartyId,
        kind: "tool_call",
        content: summary,
        toolCall: {
          name: c.toolName,
          input: c.input,
          result: out?.output,
          error: out?.error !== undefined ? String(out.error) : undefined,
        },
      });
    }
  }
}

function countToolCallsInGeneration(generation: ObpNegotiatorGeneration): number {
  let n = 0;
  for (const step of generation.steps) {
    n +=
      (step.toolCalls?.length ?? 0) +
      (step.staticToolCalls?.length ?? 0) +
      (step.dynamicToolCalls?.length ?? 0);
  }
  return n;
}

export async function negotiationTurnRunner(args: {
  agent: RegisteredAgentIdentity;
  input: unknown;
  context: SessionContext;
}): Promise<ObpNegotiatorGeneration> {
  const ctx = args.context as NegotiationSessionContext;
  const prompt = (args.input as NegotiationTurnInput).prompt;
  const actingPartyId = ctx.obpPartyIdByAgentId.get(args.agent.agentId);
  if (actingPartyId === undefined) {
    throw new Error(`no OBP party id for agent ${args.agent.agentId}`);
  }

  const env: ObpToolkitEnv = {
    client: ctx.client,
    now: ctx.now,
    actingPartyId,
    validateBind: async (v) => {
      if (v.actingPartyId !== ctx.buyerPartyId) {
        throw new Error("obp_bind_port: only the buyer may bind");
      }
      if (v.offerOwnerPartyId !== ctx.providerPartyId) {
        throw new Error("obp_bind_port: must bind to the provider's offer");
      }
    },
    ...(ctx.requestNegotiationEnd !== undefined
      ? { requestNegotiationEnd: ctx.requestNegotiationEnd }
      : {}),
  };

  const toolLoop = await createObpNegotiatorAgent({
    model: ctx.model,
    identity: args.agent,
    env,
    systemInstructions: "",
    maxSteps: 8,
    toolPipelineHooks: ctx.toolPipelineHooks,
  });

  return toolLoop.generate({ prompt });
}

function summarizeGeneration(generation: ObpNegotiatorGeneration): Record<string, unknown> {
  return {
    finishReason: generation.finishReason,
    textLength: generation.text?.length ?? 0,
    stepCount: generation.steps.length,
    toolCallCount: countToolCallsInGeneration(generation),
  };
}

/** Assistant-visible text only (mirrors `mirrorGenerationToThread` text posts, for transcript file). */
function collectAssistantTextBlocks(generation: ObpNegotiatorGeneration): string[] {
  const blocks: string[] = [];
  for (const step of generation.steps) {
    const text = step.text?.trim();
    if (text) {
      blocks.push(text);
    }
  }
  return blocks;
}

export async function runLlmNegotiation(options?: {
  scenario?: NegotiationScenario;
  maxRounds?: number;
  logFilePath?: string;
}): Promise<LlmNegotiationResult> {
  const scenario = options?.scenario ?? (await buildDefaultNegotiationScenario());
  const maxRounds = options?.maxRounds ?? scenario.maxRounds ?? MAX_ROUNDS;

  let runLog: Logger | undefined;
  let textTranscriptPath: string | undefined;
  if (options?.logFilePath !== undefined) {
    runLog = createRunLogger(options.logFilePath);
    textTranscriptPath = textTranscriptPathFromJsonl(options.logFilePath);
    initTextTranscript(textTranscriptPath, scenario.title);
    runLog.info({
      event: "negotiation.run.start",
      scenarioTitle: scenario.title,
      partyCount: scenario.parties.length,
      textTranscriptPath,
    });
  }

  let model: LanguageModel;
  try {
    model = getNegotiationModel();
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const stack = createDemoStack();
  const { client, persistence } = stack;
  const now = stack.now;

  const obpPartyIds: string[] = [];
  for (const idn of scenario.parties) {
    const { party } = client.registerParty({
      name: idn.name,
      sourcemaps: agentSourcemaps(idn),
    });
    obpPartyIds.push(party.id);
  }

  const obpPartyIdByAgentId = new Map<string, string>();
  const partyIdToDisplayName = new Map<string, string>();
  for (let i = 0; i < scenario.parties.length; i++) {
    const pid = obpPartyIds[i];
    const p = scenario.parties[i];
    if (pid === undefined || p === undefined) {
      return { status: "error", message: "internal: party / id alignment" };
    }
    obpPartyIdByAgentId.set(p.agentId, pid);
    partyIdToDisplayName.set(pid, p.name);
  }

  const providerPartyId = obpPartyIds[0];
  const buyerPartyId = obpPartyIds[1];
  if (providerPartyId === undefined || buyerPartyId === undefined) {
    return { status: "error", message: "NegotiationScenario must include at least two parties" };
  }

  let negotiationEndRequested: { reason?: string } | null = null;
  let pendingDealFromBind: CompletedDeal | null = null;

  const toolPipelineHooks: ToolPipelineHooks = {
    onToolExecuted: (ev) => {
      if (runLog !== undefined) {
        runLog.info({
          event: "obp.tool.executed",
          ok: ev.ok,
          toolName: ev.toolName,
          durationMs: ev.durationMs,
          error: ev.error !== undefined ? String(ev.error) : undefined,
        });
      }
      if (ev.ok && ev.toolName === "obp_bind_port") {
        pendingDealFromBind = resolveCompletedDeal(client, persistence, providerPartyId);
      }
    },
  };

  const negotiationCtx: NegotiationSessionContext = {
    model,
    client,
    now,
    providerPartyId,
    buyerPartyId,
    obpPartyIdByAgentId,
    toolPipelineHooks,
    requestNegotiationEnd: (args) => {
      negotiationEndRequested = args;
    },
  };

  const registry = createAgentRegistry();
  for (const partyIdentity of scenario.parties) {
    registry.register(partyIdentity, {
      run: negotiationTurnRunner,
      ctx: [negotiationCtx],
    });
  }

  const thread = new InMemoryNegotiationContext({ partyIds: obpPartyIds });

  logObserverHeader("LLM OBP negotiation (thread + OBP tools)");
  console.log("[observer] scenario", scenario.title);
  console.log(
    "[observer] parties",
    obpPartyIds.map((id) => ({ obpPartyId: id, name: partyIdToDisplayName.get(id) })),
  );

  try {
    for (let round = 0; round < maxRounds; round++) {
      const dealAtRoundStart = resolveCompletedDeal(client, persistence, providerPartyId);
      if (dealAtRoundStart !== null) {
        runLog?.info({
          event: "negotiation.run.deal",
          ...dealAtRoundStart,
          rounds: round,
        });
        return {
          status: "deal",
          ...dealAtRoundStart,
          rounds: round,
        };
      }

      const idx = round % scenario.parties.length;
      const identity = scenario.parties[idx];
      const actingPartyId = obpPartyIds[idx];
      if (identity === undefined || actingPartyId === undefined) {
        return { status: "error", message: "internal: party index out of range" };
      }
      const roleLabel = identity.name;

      const messages = await thread.withContext({ forPartyId: actingPartyId });
      const threadText = formatThreadForPrompt(messages, partyIdToDisplayName);
      const user = buildUserMessage({ threadText });

      const turnInput: NegotiationTurnInput = { prompt: user };

      const session = registry.createSession(identity.agentId, {
        hooks: {
          onBeforeRun: async ({ agent, input }) => {
            runLog?.info({
              event: "negotiation.session.beforeRun",
              round,
              agentId: agent.agentId,
              agentName: agent.name,
              prompt: (input as NegotiationTurnInput).prompt,
              threadText,
            });
          },
          onAfterRun: async ({ agent, output }) => {
            const generation = output as ObpNegotiatorGeneration;
            const partyId = obpPartyIdByAgentId.get(agent.agentId);
            if (partyId !== undefined) {
              await mirrorGenerationToThread({
                generation,
                ctx: thread,
                authorPartyId: partyId,
              });
            }
            if (textTranscriptPath !== undefined) {
              appendTextTranscriptTurn({
                destPath: textTranscriptPath,
                round,
                agentName: agent.name,
                textBlocks: collectAssistantTextBlocks(generation),
              });
            }
            runLog?.info({
              event: "negotiation.session.afterRun",
              round,
              agentId: agent.agentId,
              generation: summarizeGeneration(generation),
            });
          },
          onError: async ({ agent, error }) => {
            runLog?.error({
              event: "negotiation.session.error",
              round,
              agentId: agent.agentId,
              err: error instanceof Error ? error.message : String(error),
            });
          },
        },
      });

      const generation = (await session.start(turnInput)) as ObpNegotiatorGeneration;

      const toolCallCount = countToolCallsInGeneration(generation);
      if (process.env.OBP_DEMO_OBSERVER_CONSOLE === "1") {
        logGeneration({ round, role: roleLabel, user, generation });
      } else {
        logRoundSummary({ round, role: roleLabel, toolCallCount });
      }

      if (negotiationEndRequested !== null) {
        const { reason } = negotiationEndRequested;
        negotiationEndRequested = null;
        pendingDealFromBind = null;
        runLog?.info({
          event: "negotiation.run.terminated",
          reason,
          rounds: round + 1,
        });
        return { status: "terminated", reason, rounds: round + 1 };
      }

      const deal = pendingDealFromBind ?? resolveCompletedDeal(client, persistence, providerPartyId);
      pendingDealFromBind = null;
      if (deal !== null) {
        runLog?.info({ event: "negotiation.run.deal", ...deal, rounds: round + 1 });
        return {
          status: "deal",
          offerId: deal.offerId,
          portId: deal.portId,
          portType: deal.portType,
          rounds: round + 1,
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    runLog?.error({ event: "negotiation.run.error", err: msg });
    return {
      status: "error",
      message: msg,
    };
  }

  runLog?.info({ event: "negotiation.run.exhausted", rounds: maxRounds });
  return { status: "exhausted", rounds: maxRounds };
}
