import {
  computeInvocationContextHash,
  createAgentRegistry,
  type RegisteredAgentIdentity,
  type SessionContext,
  type ToolPipelineHooks,
} from "@khoralabs/agent-identity";
import {
  formatThreadForPlaintext,
  InMemoryThreadContext,
  mirrorGenerationToThread,
  postThreadUserText,
} from "@khoralabs/agent-thread";
import type { EmbeddingModel } from "@khoralabs/memories-core/helpers";
import { JsonlStore } from "@khoralabs/memories-stores";
import { type MemorySearchEnv, toMemorySearchEnv } from "@khoralabs/memories-tools";
import {
  type CompletedDeal,
  type OBPPersistenceClient,
  type ObpPersistence,
  resolveCompletedDeal,
} from "@khoralabs/obp-persistence-client";
import {
  createObpNegotiatorSessionRunner,
  negotiationEndPayloadFromGeneration,
  type ObpNegotiatorGeneration,
  type ObpNegotiatorSessionOutput,
} from "@khoralabs/obp-negotiator";
import {
  agentSourcemaps,
  captureNegotiationEndFromToolExecuted,
  computeNegotiationContext,
  isDynamicBindToolName,
  type ObpToolkitEnv,
} from "@khoralabs/obp-tools";
import type { LanguageModel } from "ai";
import {
  appendTextTranscriptInvitation,
  appendTextTranscriptTurn,
  createDemoStack,
  createLoggingObpPersistence,
  ensureObpRunDir,
  getNegotiationModel,
  initTextTranscript,
  isObpMemoryMode,
  obpStepLogFromEnv,
  resolveObpDatabasePath,
  resolveObpStepsJsonlPath,
  textTranscriptPathFromJsonl,
} from "../matchmaking-obp/index.ts";
import { buildNegotiatorRagContext } from "../memories/build-negotiator-rag-context.ts";
import { createMatchmakingMemoriesBundle } from "../memories/create-memories-bundle.ts";
import { getMatchmakingEmbeddingModel } from "../memories/matchmaking-embedding.ts";
import { mergeMeetingDomainPayloadIntoNamespace } from "../memories/merge-meeting-payload.ts";
import { resolveMemoriesDbPath, resolveMemoriesRoot } from "../memories/persisted-memories.ts";
import type { ThreadDevLog } from "../negotiation-run-registry.ts";
import {
  getMatchmakingPersona,
  MATCHMAKING_SIM_PERSONA_SLUGS,
  type MatchmakingPersonaSlug,
  matchmakingPersonas,
} from "../personas/index.ts";
import { resolveMatchmakingSubjectId } from "../resolve-subject-id.ts";
import { buildAppUserIntroRequestScenario, type MatchmakingScenario } from "../scenarios";
import { readUserPublicProfileState } from "../user-public-profile.ts";
import { buildMatchmakingUserMessage } from "./messages.ts";
import {
  buildMatchmakingPartySystemInstructions,
  type NegotiationPublicCard,
  negotiationPublicCardFromUserProfile,
} from "./party-identity-instructions.ts";
import { matchmakingRoundPartyIndex } from "./session-turn-order.ts";
import { matchmakingValueFirewallInstructions } from "./value-firewall-instructions.ts";

/** Per negotiator turn; fresh env each {@link matchmakingTurnRunner} call resets {@code used}. RAG prefetch reduces reliance on tool calls. */
const MATCHMAKING_MEMORY_SEARCH_BUDGET_MAX = 2;

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
  client: OBPPersistenceClient;
  persistence: ObpPersistence;
  ledgerSeq: () => number;
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
  /** OBP negotiator session: per-turn {@code ObpToolkitEnv} (+ memory) from this context. */
  resolveEnv: import("@khoralabs/obp-negotiator").ObpNegotiatorResolveEnv;
  systemInstructions?: string;
  defaultMaxSteps?: number;
  /** Filled in {@code onBeforeRun}: per-user/persona binding (see `computeInvocationContextHash`). */
  invocationHashByAgentId: Map<string, string | undefined>;
};

/** Terminal bind on an offer extended by either party (mutual intro commitment). */
export function resolveMatchmakingConnectedDeal(
  client: OBPPersistenceClient,
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

export const matchmakingTurnRunner = createObpNegotiatorSessionRunner();

async function buildMatchmakingToolkitEnv(
  args: { agent: RegisteredAgentIdentity; context: SessionContext },
  ctx: MatchmakingSessionContext,
): Promise<ObpToolkitEnv & MemorySearchEnv> {
  const { agent } = args;
  const actingPartyId = ctx.obpPartyIdByAgentId.get(agent.agentId);
  if (actingPartyId === undefined) {
    throw new Error(`no OBP party id for agent ${agent.agentId}`);
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
    ledgerSeq: ctx.ledgerSeq(),
    validateBind,
  });

  const memoryNs = ctx.memoryNamespaceByAgentId.get(agent.agentId);
  if (memoryNs === undefined) {
    throw new Error(`no memory namespace for agent ${agent.agentId}`);
  }

  const memorySlice = toMemorySearchEnv({
    client: ctx.memoriesClient,
    namespace: memoryNs,
    embeddingModel: ctx.embeddingModel,
    embeddingCache: ctx.embeddingCache,
    memorySearchBudgetMax: MATCHMAKING_MEMORY_SEARCH_BUDGET_MAX,
  });

  return {
    ...memorySlice,
    client: ctx.client,
    ledgerSeq: ctx.ledgerSeq,
    actingPartyId,
    validateBind,
    negotiationToolContext,
    requestNegotiationEnd: (a) => {
      ctx.negotiationEndSignal.current = a;
    },
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
  /** Defaults to {@link resolveMemoriesRoot} (e.g. {@code .memories} under cwd). */
  memoriesRoot?: string;
  /** Defaults to {@link resolveMemoriesDbPath} or {@code MEMORIES_DB}. */
  memoriesDbPath?: string;
  /** Optional: append events to a per-run JsonlStore file (dev drawer). */
  threadDevLog?: ThreadDevLog;
  /**
   * Correlates file-backed OBP SQLite + optional `obp-steps.jsonl` under {@code OBP_DIR}/{runId}/.
   * Omit when {@link isObpMemoryMode} is active or for in-memory-only runs.
   */
  runId?: string;
}): Promise<MatchmakingResult> {
  const defaultInvitee = MATCHMAKING_SIM_PERSONA_SLUGS.at(1);
  if (defaultInvitee === undefined) {
    return { status: "error", message: "internal: default invitee slug missing" };
  }
  const scenario = options?.scenario ?? (await buildAppUserIntroRequestScenario(defaultInvitee));
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

  const memoriesRoot = options?.memoriesRoot ?? resolveMemoriesRoot();
  const memoriesDbPath = options?.memoriesDbPath ?? resolveMemoriesDbPath(memoriesRoot);
  const memoriesBundle = createMatchmakingMemoriesBundle(memoriesDbPath, {
    memoriesRoot,
    domainLexicalStore: true,
  });
  const embeddingModel = getMatchmakingEmbeddingModel();
  const embeddingCache = new Map<string, number[]>();

  const runIdForInviteMerge = options?.runId?.trim();
  if (runIdForInviteMerge !== undefined && runIdForInviteMerge.length > 0) {
    const invText = scenario.partyAInvitationMessage?.trim();
    if (invText) {
      try {
        await Promise.all(
          scenario.partyMemoryNamespaces.map((namespace) =>
            mergeMeetingDomainPayloadIntoNamespace({
              bundle: memoriesBundle,
              chatModel: model,
              embeddingModel,
              namespace,
              memoryKey: `live/invite/${runIdForInviteMerge}`,
              domainPayload: { kind: "meeting_invite", text: invText },
              correlationId: `live-invite-${namespace}-${runIdForInviteMerge}`,
            }),
          ),
        );
      } catch (e) {
        return {
          status: "error",
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  const runId = options?.runId?.trim();
  const diskObp = !isObpMemoryMode() && runId !== undefined && runId.length > 0;
  let databasePath: string | undefined;
  if (diskObp) {
    ensureObpRunDir(runId);
    databasePath = resolveObpDatabasePath(runId);
  }

  const stack = createDemoStack(databasePath !== undefined ? { databasePath } : undefined);
  let persistence: ObpPersistence = stack.persistence;
  const shouldLogObpSteps =
    diskObp &&
    runId !== undefined &&
    runId.length > 0 &&
    (options?.threadDevLog !== undefined || obpStepLogFromEnv());
  if (shouldLogObpSteps) {
    const stepsPath = resolveObpStepsJsonlPath(runId);
    const store = new JsonlStore(stepsPath);
    const memoryId = `matchmaking-obp/${runId}`;
    persistence = createLoggingObpPersistence(stack.persistence, {
      store,
      memoryId,
      nowMs: stack.demoLogNowMs,
    });
  }

  const { client } = stack;
  const ledgerSeq = stack.ledgerSeq;

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

  const invitation = scenario.partyAInvitationMessage?.trim();
  const hasInvitation = Boolean(invitation);

  const requesterStatic = requesterIdentity.staticContext as Record<string, unknown> | undefined;
  const requesteeStatic = requesteeIdentity.staticContext as Record<string, unknown> | undefined;
  const rawRequesterSlug = requesterStatic?.personaSlug;
  const rawRequesteeSlug = requesteeStatic?.personaSlug;

  const partyAIsAppUser =
    typeof rawRequesterSlug === "string" && rawRequesterSlug.startsWith("user:");

  let partyACard: NegotiationPublicCard;
  if (partyAIsAppUser) {
    partyACard = negotiationPublicCardFromUserProfile(readUserPublicProfileState());
  } else {
    if (typeof rawRequesterSlug !== "string" || !(rawRequesterSlug in matchmakingPersonas)) {
      return { status: "error", message: "internal: requester persona slug missing or invalid" };
    }
    const requesterPersona = getMatchmakingPersona(rawRequesterSlug as MatchmakingPersonaSlug);
    partyACard = {
      displayName: requesterPersona.displayName,
      tagline: requesterPersona.profile.tagline,
      about: requesterPersona.profile.about,
    };
  }

  if (typeof rawRequesteeSlug !== "string" || !(rawRequesteeSlug in matchmakingPersonas)) {
    return { status: "error", message: "internal: requestee persona slug missing or invalid" };
  }
  const requesteePersonaSlug = rawRequesteeSlug as MatchmakingPersonaSlug;
  const inviteePersona = getMatchmakingPersona(requesteePersonaSlug);
  const partyBCard = {
    displayName: inviteePersona.displayName,
    tagline: inviteePersona.profile.tagline,
    about: inviteePersona.profile.about,
  };

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
    ledgerSeq,
    requesterPartyId,
    requesteePartyId,
    obpPartyIdByAgentId,
    toolPipelineHooks,
    negotiationEndSignal,
    memoriesClient: memoriesBundle.client,
    embeddingModel,
    memoryNamespaceByAgentId,
    embeddingCache,
    systemInstructions: matchmakingValueFirewallInstructions,
    defaultMaxSteps: 8,
    invocationHashByAgentId: new Map(),
    async resolveEnv(args) {
      const c = args.context as MatchmakingSessionContext;
      return buildMatchmakingToolkitEnv(args, c);
    },
  };

  const registry = createAgentRegistry();
  for (const partyIdentity of scenario.parties) {
    registry.register(partyIdentity, {
      run: matchmakingTurnRunner,
      ctx: [sessionCtx],
    });
  }

  const thread = new InMemoryThreadContext({ participantIds: obpPartyIds });

  const devLog = options?.threadDevLog;
  if (invitation) {
    await thread.postMessage(postThreadUserText(requesterPartyId, invitation));
    if (textTranscriptPath !== undefined) {
      appendTextTranscriptInvitation({
        destPath: textTranscriptPath,
        agentName: requesterIdentity.name,
        text: invitation,
      });
    }
    if (devLog !== undefined) {
      devLog.append("Party A invite (user message)", `${requesterIdentity.name}: ${invitation}`);
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

      const idx = matchmakingRoundPartyIndex(round, scenario.parties.length, hasInvitation);
      const identity = scenario.parties[idx];
      const actingPartyId = obpPartyIds[idx];
      if (identity === undefined || actingPartyId === undefined) {
        return { status: "error", message: "internal: party index out of range" };
      }
      const messages = await thread.withContext({ forParticipantId: actingPartyId });
      const threadText = formatThreadForPlaintext(messages, partyIdToDisplayName);
      const partyLetter = actingPartyId === requesterPartyId ? "A" : "B";
      const orchestrationTail = hasInvitation
        ? "Party A's user posted the opening invitation; Party B responds first, then turns alternate B, A, B, A…"
        : "Turns rotate A, B, A, B…";

      let ragBlock: string | null | undefined;
      const memoryNsForTurn = sessionCtx.memoryNamespaceByAgentId.get(identity.agentId);
      if (memoryNsForTurn !== undefined && memoryNsForTurn.length > 0) {
        ragBlock = await buildNegotiatorRagContext({
          client: sessionCtx.memoriesClient,
          namespace: memoryNsForTurn,
          embeddingModel: sessionCtx.embeddingModel,
          embeddingCache: sessionCtx.embeddingCache,
          threadText,
        });
      }

      const user = buildMatchmakingUserMessage({
        threadText,
        orchestrationNote: `Orchestration (this run only): you are Party ${partyLetter} in this two-party intro negotiation (Party A = first registered seat, Party B = second). ${orchestrationTail}`,
        ...(ragBlock !== undefined && ragBlock !== null
          ? { retrievedMemoryContext: ragBlock }
          : {}),
      });

      const turnInput: MatchmakingTurnInput = { prompt: user };

      const systemInstructions = buildMatchmakingPartySystemInstructions(
        matchmakingValueFirewallInstructions,
        {
          selfCard: partyLetter === "A" ? partyACard : partyBCard,
          counterpartyCard: partyLetter === "A" ? partyBCard : partyACard,
          partyLetter,
          hasUserInvitationLine: hasInvitation,
        },
      );

      const session = registry.createSession(identity.agentId, {
        ctx: [{ systemInstructions }],
        hooks: {
          onBeforeRun: async ({ agent }) => {
            const sc = agent.staticContext as Record<string, unknown>;
            const subjectId =
              typeof sc.subjectId === "string" && sc.subjectId.length > 0
                ? sc.subjectId
                : resolveMatchmakingSubjectId();
            const personaSlug = typeof sc.personaSlug === "string" ? sc.personaSlug : "unknown";
            const memoryNamespace =
              typeof sc.memoryNamespace === "string" && sc.memoryNamespace.length > 0
                ? sc.memoryNamespace
                : typeof sc.targetNamespace === "string"
                  ? sc.targetNamespace
                  : "";
            const ctxVersion = typeof sc.contextVersion === "number" ? sc.contextVersion : 0;
            const h = await computeInvocationContextHash({
              subjectId,
              personaSlug,
              memoryNamespace,
              contextVersion: ctxVersion,
            });
            if (h !== undefined) {
              sessionCtx.invocationHashByAgentId.set(agent.agentId, h);
            }
          },
          onAfterRun: async ({ agent, output }) => {
            const { generation } = output as ObpNegotiatorSessionOutput;
            const partyId = obpPartyIdByAgentId.get(agent.agentId);
            if (partyId !== undefined) {
              await mirrorGenerationToThread({
                generation,
                ctx: thread,
                authorId: partyId,
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
            if (devLog !== undefined) {
              const textBlocks = collectAssistantTextBlocks(generation);
              if (textBlocks.length > 0) {
                const inv = sessionCtx.invocationHashByAgentId.get(agent.agentId);
                const line =
                  inv !== undefined
                    ? `${textBlocks.join("\n\n")}\n\n[invocationHash: ${inv}]`
                    : textBlocks.join("\n\n");
                devLog.append(`round ${round} · ${agent.name}`, line);
              }
            }
          },
          onError: async () => {},
        },
      });

      const { generation } = (await session.start(turnInput)) as ObpNegotiatorSessionOutput;

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
