import type {
  AgentRegistry,
  RegisterAgentOptions,
  RegisteredAgentIdentity,
  SessionContext,
  SessionRunner,
} from "@cfd/agent-identity";
import { type FlexibleSchema, generateObject, type LanguageModel } from "ai";
import {
  buildObpNegotiatorAgentId,
  type DefineObpNegotiatorIdentityOptions,
  defineObpNegotiatorIdentity,
} from "./identity.ts";
import { obpNegotiatorStructuredInstructionAppendix } from "./instructions.ts";

/**
 * Structural per-turn contract handed to the structured session runner via
 * {@link ObpNegotiatorStructuredSessionContext}.
 *
 * Defined here (not imported from any orchestrator package) so the negotiator
 * remains decoupled from `@cfd/obp-agent-runtime`. Any host can produce one of
 * these — see `createNegotiationStructuredBilateralContract` in
 * `@cfd/obp-agent-runtime` for the bilateral reference implementation.
 */
export type ObpNegotiatorPreparedTurn = {
  /**
   * Output schema (Zod or Standard Schema). Either {@code zodOutputSchema} or
   * {@code outputSchema} must be set; Zod takes precedence when both are present.
   *
   * Typed loosely as `unknown` so callers stay free of the AI SDK's stricter
   * `FlexibleSchema` constraint; the runner does a single boundary cast.
   */
  zodOutputSchema?: unknown;
  outputSchema?: unknown;
  /** Lines appended to the agent's static instruction for this turn. */
  systemFragments: readonly string[];
  /** User message rendering this party's view of the negotiation. */
  userMessage: string;
  /**
   * Optional schema name + description for AI SDK providers that pass them as
   * additional LLM guidance (e.g. via tool/schema name).
   */
  metadata?: { outputName?: string; outputDescription?: string };
};

export type ObpNegotiatorStructuredSessionContext = SessionContext & {
  model: LanguageModel;
  prepared: ObpNegotiatorPreparedTurn;
  /**
   * Optional wall-clock budget for {@code generateObject}. When set, a timer races
   * the call and rejects with a descriptive error after {@code budgetMs}.
   */
  budgetMs?: number;
};

export type ObpNegotiatorStructuredSessionInput = Record<string, never>;

export type ObpNegotiatorStructuredSessionOutput = { output: unknown };

function pickSchema(prepared: ObpNegotiatorPreparedTurn): FlexibleSchema<unknown> {
  const s = prepared.zodOutputSchema ?? prepared.outputSchema;
  if (s === undefined) {
    throw new Error(
      "ObpNegotiatorPreparedTurn: one of `zodOutputSchema` or `outputSchema` must be set",
    );
  }
  return s as FlexibleSchema<unknown>;
}

/**
 * One structured negotiation turn: assemble the system prompt from the agent's
 * static instructions + per-turn fragments, call {@code generateObject} with the
 * prepared schema and user message, return the parsed output.
 *
 * Identity-agnostic: any agent (this package's negotiator or another) can be
 * registered against this runner.
 */
export function createObpNegotiatorStructuredSessionRunner(): SessionRunner<
  ObpNegotiatorStructuredSessionInput,
  ObpNegotiatorStructuredSessionOutput,
  ObpNegotiatorStructuredSessionContext
> {
  return async ({ agent, context }) => {
    const ctx = context as ObpNegotiatorStructuredSessionContext;
    if (ctx.prepared === undefined) {
      throw new Error("obp negotiator structured session: ctx.prepared missing");
    }

    const systemLines = [...agent.staticInstructions, ...ctx.prepared.systemFragments].filter(
      (s) => s.trim() !== "",
    );
    const system = systemLines.join("\n\n");

    const schema = pickSchema(ctx.prepared);
    const meta = ctx.prepared.metadata;

    const call = generateObject({
      model: ctx.model,
      schema,
      ...(system.length > 0 ? { system } : {}),
      prompt: ctx.prepared.userMessage,
      ...(meta?.outputName !== undefined ? { schemaName: meta.outputName } : {}),
      ...(meta?.outputDescription !== undefined
        ? { schemaDescription: meta.outputDescription }
        : {}),
    });

    let result: Awaited<typeof call>;
    if (ctx.budgetMs !== undefined) {
      const budgetMs = ctx.budgetMs;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const budget = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`obp negotiator structured session exceeded ${budgetMs}ms budget`)),
            budgetMs,
          );
        });
        result = await Promise.race([call, budget]);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
    } else {
      result = await call;
    }

    return { output: result.object };
  };
}

/**
 * Full static definition for {@link AgentRegistry.register}: identity (with the
 * structured-output instruction appendix) + the structured session runner.
 */
export async function getObpNegotiatorStructuredAgentDefinition(
  namespace: string,
  options?: DefineObpNegotiatorIdentityOptions,
): Promise<{
  staticHash: string;
  identity: RegisteredAgentIdentity;
  registerOptions: RegisterAgentOptions<
    ObpNegotiatorStructuredSessionInput,
    ObpNegotiatorStructuredSessionOutput,
    ObpNegotiatorStructuredSessionContext
  >;
}> {
  const merged: DefineObpNegotiatorIdentityOptions = {
    ...(options ?? {}),
    instructions: [...(options?.instructions ?? []), obpNegotiatorStructuredInstructionAppendix],
  };
  const { staticHash, identity } = await defineObpNegotiatorIdentity(namespace, merged);
  return {
    staticHash,
    identity,
    registerOptions: { run: createObpNegotiatorStructuredSessionRunner() },
  };
}

/**
 * Idempotent: returns the existing registered identity for {@code namespace} or
 * registers a new structured negotiator agent with the given options.
 */
export async function ensureObpNegotiatorStructuredAgentRegistered(
  registry: AgentRegistry,
  namespace: string,
  options?: DefineObpNegotiatorIdentityOptions,
): Promise<{ staticHash: string; identity: RegisteredAgentIdentity }> {
  const id = buildObpNegotiatorAgentId(namespace);
  if (registry.has(id)) {
    const entry = registry.get(id);
    if (!entry) {
      throw new Error(`registry inconsistency: has(${id}) but get is undefined`);
    }
    return { staticHash: entry.agent.staticHash, identity: entry.agent };
  }
  const { staticHash, identity, registerOptions } = await getObpNegotiatorStructuredAgentDefinition(
    namespace,
    options,
  );
  registry.register(identity, registerOptions);
  return { staticHash, identity };
}
