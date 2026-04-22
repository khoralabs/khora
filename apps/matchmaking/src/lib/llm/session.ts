import {
  createAgentRegistry,
  type RegisteredAgentIdentity,
  type SessionContext,
  type ToolPipelineHooks,
} from "@cfd/agent-identity";
import type { EmbeddingModel } from "@cfd/memories-core/helpers";
import { type MemorySearchEnv, toMemorySearchEnv } from "@cfd/memories-tools";
import {
  InMemoryNegotiationContext,
  type NegotiationMessage,
  type ObpClient,
  type ObpPersistence,
} from "@cfd/obp-core";
import { createObpNegotiatorAgent, type ObpNegotiatorGeneration } from "@cfd/obp-negotiator";
import {
  captureNegotiationEndFromToolExecuted,
  computeNegotiationContext,
  isDynamicBindToolName,
  type ObpToolkitEnv,
} from "@cfd/obp-tools";
import type { LanguageModel } from "ai";
import {
  agentSourcemaps,
  appendTextTranscriptInvitation,
  appendTextTranscriptTurn,
  createDemoStack,
  getNegotiationModel,
  initTextTranscript,
  negotiationEndPayloadFromGeneration,
  resolveCompletedDeal,
  textTranscriptPathFromJsonl,
  type CompletedDeal,
} from "../matchmaking-obp/index.ts";
import { createMatchmakingMemoriesBundle } from "../memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "../memories/matchmaking-embedding.ts";
import {
  personaMemoriesAlreadySeeded,
  resolveObpDemoMemoriesDbPath,
  resolveObpDemoMemoriesRoot,
  shouldForceMemoriesReseed,
  syncMatchmakingScenarioJsonlStores,
} from "../memories/persisted-memories.ts";
import { seedMatchmakingPersonas } from "../memories/seed-personas.ts";
import { buildIntroRequestScenarioPair, type MatchmakingScenario } from "../scenarios";
import { buildMatchmakingUserMessage } from "./messages.ts";

/** Per negotiator turn; fresh env each {@link matchmakingTurnRunner} call resets {@code used}. */
const MATCHMAKING_MEMORY_SEARCH_BUDGET_MAX = 6;

export type MatchmakingResult =
  | {
      status: "connected";
      offerId: string;
      portId: string;
      portType: string;
      rounds: number;
    }
  | { status: "terminated"; reason?: string; rounds: number }
  | { status: "exhausted"; rounds: number }
  | { status: "error"; message: string };

const DEFAULT_MAX_ROUNDS = 12;

export type MatchmakingTurnInput = {
  prompt: string;
};

export type MatchmakingSessionContext = SessionContext & {
  model: LanguageModel;
  client: ObpClient;
  persistence: ObpPersistence;
  now: () => number;
  requesterPartyId: string;
  requesteePartyId: string;
  obpPartyIdByAgentId: Map<string, string>;
  toolPipelineHooks?: ToolPipelineHooks;
  /** Shared ref updated by {@code requestNegotiationEnd} and by successful {@code obp_end_negotiation} tool hooks. */
  negotiationEndSignal: { current: { reason?: string } | null };
  memoriesClient: ReturnType<typeof createMatchmakingMemoriesBundle>["client"];
  embeddingModel: EmbeddingModel;
  memoryNamespaceByAgentId: Map<string, string>;
  embeddingCache: Map<string, number[]>;
};

/** Terminal bind on an offer extended by either party (mutual intro commitment). */
export function resolveMatchmakingConnectedDeal(
  client: ObpClient,
  persistence: ObpPersistence,
  requesterPartyId: string,
  requesteePartyId: string,
): CompletedDeal | null {
  return (
    resolveCompletedDeal(client, persistence, requesterPartyId) ??
    resolveCompletedDeal(client, persistence, requesteePartyId)
  );
}

export function assertMatchmakingBindAllowed(args: {
  actingPartyId: string;
  offerOwnerPartyId: string | null;
}): void {
  if (args.offerOwnerPartyId !== null && args.actingPartyId === args.offerOwnerPartyId) {
    throw new Error("obp_bind: you may not bind to your own offer");
  }
}

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
    let line = `[${tag}] ${who}: ${m.content}`;
    if (m.kind === "tool_call" && m.toolCall !== undefined) {
      if (m.toolCall.result !== undefined) {
        try {
          line += ` => ${JSON.stringify(m.toolCall.result)}`;
        } catch {
          line += " => <result>";
        }
      } else if (m.toolCall.error !== undefined) {
        line += ` => error: ${m.toolCall.error}`;
      }
    }
    lines.push(line);
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
      let summary: string;
      try {
        summary = `${c.toolName}(${JSON.stringify(c.input)})`;
      } catch {
        summary = `${c.toolName}(<unserializable input>)`;
      }
      const out = resultById.get(c.toolCallId);
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

export async function matchmakingTurnRunner(args: {
  agent: RegisteredAgentIdentity;
  input: unknown;
  context: SessionContext;
}): Promise<ObpNegotiatorGeneration> {
  const ctx = args.context as MatchmakingSessionContext;
  const prompt = (args.input as MatchmakingTurnInput).prompt;
  const actingPartyId = ctx.obpPartyIdByAgentId.get(args.agent.agentId);
  if (actingPartyId === undefined) {
    throw new Error(`no OBP party id for agent ${args.agent.agentId}`);
  }

  const validateBind: ObpToolkitEnv["validateBind"] = async (v) => {
    assertMatchmakingBindAllowed({
      actingPartyId: v.actingPartyId,
      offerOwnerPartyId: v.offerOwnerPartyId,
    });
  };

  const negotiationToolContext = await computeNegotiationContext({
    client: ctx.client,
    persistence: ctx.persistence,
    actingPartyId,
    now: ctx.now(),
    validateBind,
  });

  const memoryNs = ctx.memoryNamespaceByAgentId.get(args.agent.agentId);
  if (memoryNs === undefined) {
    throw new Error(`no memory namespace for agent ${args.agent.agentId}`);
  }

  const memorySlice = toMemorySearchEnv({
    client: ctx.memoriesClient,
    namespace: memoryNs,
    embeddingModel: ctx.embeddingModel,
    embeddingCache: ctx.embeddingCache,
    memorySearchBudgetMax: MATCHMAKING_MEMORY_SEARCH_BUDGET_MAX,
  });

  const env: ObpToolkitEnv & MemorySearchEnv = {
    ...memorySlice,
    client: ctx.client,
    now: ctx.now,
    actingPartyId,
    validateBind,
    negotiationToolContext,
    requestNegotiationEnd: (args) => {
      ctx.negotiationEndSignal.current = args;
    },
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

export async function runMatchmakingSession(options?: {
  scenario?: MatchmakingScenario;
  maxRounds?: number;
  logFilePath?: string;
  /** Defaults to {@link resolveObpDemoMemoriesRoot} (e.g. {@code .obp-demo-memories} under cwd). */
  memoriesRoot?: string;
  /** Defaults to {@link resolveObpDemoMemoriesDbPath} or {@code OBP_DEMO_MEMORIES_DB}. */
  memoriesDbPath?: string;
  /** When true, re-runs persona seeding even if the SQLite DB already has enough rows per namespace. */
  forceReseedMemories?: boolean;
}): Promise<MatchmakingResult> {
  const scenario = options?.scenario ?? (await buildIntroRequestScenarioPair("p1", "p2"));
  const maxRounds = options?.maxRounds ?? scenario.maxRounds ?? DEFAULT_MAX_ROUNDS;

  let textTranscriptPath: string | undefined;
  if (options?.logFilePath !== undefined) {
    textTranscriptPath = textTranscriptPathFromJsonl(options.logFilePath);
    initTextTranscript(textTranscriptPath, scenario.title);
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

  const memoriesRoot = options?.memoriesRoot ?? resolveObpDemoMemoriesRoot();
  const memoriesDbPath = options?.memoriesDbPath ?? resolveObpDemoMemoriesDbPath(memoriesRoot);
  const memoriesBundle = createMatchmakingMemoriesBundle(memoriesDbPath);
  const embeddingModel = getMatchmakingEmbeddingModel();
  const embeddingCache = new Map<string, number[]>();

  const [partyAMemoryNs, partyBMemoryNs] = scenario.partyMemoryNamespaces;
  const forceReseed = options?.forceReseedMemories === true || shouldForceMemoriesReseed();

  const skipPersonaSeed =
    !forceReseed &&
    personaMemoriesAlreadySeeded(memoriesBundle, scenario, partyAMemoryNs, partyBMemoryNs);

  try {
    if (!skipPersonaSeed) {
      await seedMatchmakingPersonas({
        bundle: memoriesBundle,
        chatModel: model,
        embeddingModel,
        partyMemoryNamespaces: scenario.partyMemoryNamespaces,
        personaSeeds: scenario.personaSeeds,
      });
    }

    syncMatchmakingScenarioJsonlStores({
      bundle: memoriesBundle,
      memoriesRoot,
      partyMemoryNamespaces: scenario.partyMemoryNamespaces,
    });
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

  const requesterPartyId = obpPartyIds[0];
  const requesteePartyId = obpPartyIds[1];
  if (requesterPartyId === undefined || requesteePartyId === undefined) {
    return { status: "error", message: "MatchmakingScenario must include at least two parties" };
  }

  const requesterIdentity = scenario.parties[0];
  const requesteeIdentity = scenario.parties[1];
  if (requesterIdentity === undefined || requesteeIdentity === undefined) {
    return { status: "error", message: "internal: scenario parties missing" };
  }
  const memoryNamespaceByAgentId = new Map<string, string>([
    [requesterIdentity.agentId, scenario.partyMemoryNamespaces[0]],
    [requesteeIdentity.agentId, scenario.partyMemoryNamespaces[1]],
  ]);

  const negotiationEndSignal = { current: null as { reason?: string } | null };
  let pendingConnectedFromBind: CompletedDeal | null = null;

  const toolPipelineHooks: ToolPipelineHooks = {
    onToolExecuted: (ev) => {
      captureNegotiationEndFromToolExecuted(ev, negotiationEndSignal);
      if (ev.ok && (isDynamicBindToolName(ev.toolName) || ev.toolName === "obp_bind_port")) {
        pendingConnectedFromBind = resolveMatchmakingConnectedDeal(
          client,
          persistence,
          requesterPartyId,
          requesteePartyId,
        );
      }
    },
  };

  const sessionCtx: MatchmakingSessionContext = {
    model,
    client,
    persistence,
    now,
    requesterPartyId,
    requesteePartyId,
    obpPartyIdByAgentId,
    toolPipelineHooks,
    negotiationEndSignal,
    memoriesClient: memoriesBundle.client,
    embeddingModel,
    memoryNamespaceByAgentId,
    embeddingCache,
  };

  const registry = createAgentRegistry();
  for (const partyIdentity of scenario.parties) {
    registry.register(partyIdentity, {
      run: matchmakingTurnRunner,
      ctx: [sessionCtx],
    });
  }

  const thread = new InMemoryNegotiationContext({ partyIds: obpPartyIds });

  const invitation = scenario.partyAInvitationMessage?.trim();
  if (invitation) {
    await thread.postMessage({
      authorPartyId: requesterPartyId,
      kind: "text",
      content: invitation,
    });
    if (textTranscriptPath !== undefined) {
      appendTextTranscriptInvitation({
        destPath: textTranscriptPath,
        agentName: requesterIdentity.name,
        text: invitation,
      });
    }
  }

  try {
    for (let round = 0; round < maxRounds; round++) {
      const connectedAtStart = resolveMatchmakingConnectedDeal(
        client,
        persistence,
        requesterPartyId,
        requesteePartyId,
      );
      if (connectedAtStart !== null) {
        return {
          status: "connected",
          ...connectedAtStart,
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
      const partyLetter = actingPartyId === requesterPartyId ? "A" : "B";
      const user = buildMatchmakingUserMessage({
        threadText,
        orchestrationNote: `Orchestration (this run only): you are Party ${partyLetter} in this two-party intro negotiation (Party A = first registered seat, Party B = second; turns rotate A, B, A…).`,
      });

      const turnInput: MatchmakingTurnInput = { prompt: user };

      const session = registry.createSession(identity.agentId, {
        hooks: {
          onBeforeRun: async ({ agent, input }) => {},
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
          },
          onError: async ({ agent, error }) => {},
        },
      });

      const generation = (await session.start(turnInput)) as ObpNegotiatorGeneration;

      const endFromHooks = negotiationEndSignal.current;
      const endFromGeneration = negotiationEndPayloadFromGeneration(generation);
      const endPayload = endFromHooks ?? endFromGeneration;
      if (endPayload !== null) {
        const { reason } = endPayload;
        negotiationEndSignal.current = null;
        pendingConnectedFromBind = null;
        return { status: "terminated", reason, rounds: round + 1 };
      }

      const connected =
        pendingConnectedFromBind ??
        resolveMatchmakingConnectedDeal(client, persistence, requesterPartyId, requesteePartyId);
      pendingConnectedFromBind = null;
      if (connected !== null) {
        return {
          status: "connected",
          offerId: connected.offerId,
          portId: connected.portId,
          portType: connected.portType,
          rounds: round + 1,
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      status: "error",
      message: msg,
    };
  }

  return { status: "exhausted", rounds: maxRounds };
}
