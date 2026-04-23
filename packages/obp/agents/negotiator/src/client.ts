import type { AgentRegistry, ToolPipelineHooks } from "@cfd/agent-identity";
import type { LanguageModel } from "ai";
import { buildObpNegotiatorAgentId, type DefineObpNegotiatorIdentityOptions } from "./identity.ts";
import {
  ensureObpNegotiatorAgentRegistered,
  type ObpNegotiatorResolveEnv,
  type ObpNegotiatorSessionInput,
  type ObpNegotiatorSessionOutput,
} from "./negotiator-session.ts";

export type ObpNegotiatorClientOptions = DefineObpNegotiatorIdentityOptions & {
  /** Omitted if every {@link turn} supplies {@code overrides.registry}. */
  registry?: AgentRegistry;
  namespace: string;
  model: LanguageModel;
  /**
   * How to build OBP toolkit env for each run.
   * Omitted if every {@link turn} provides {@code overrides.resolveEnv}.
   */
  resolveEnv?: ObpNegotiatorResolveEnv;
  toolPipelineHooks?: ToolPipelineHooks;
  systemInstructions?: string;
  defaultMaxSteps?: number;
};

export type ObpNegotiatorTurnOverrides = {
  namespace?: string;
  model?: LanguageModel;
  registry?: AgentRegistry;
  resolveEnv?: ObpNegotiatorResolveEnv;
  toolPipelineHooks?: ToolPipelineHooks;
  systemInstructions?: string;
  defaultMaxSteps?: number;
};

/**
 * Host wiring: {@link ensureObpNegotiatorAgentRegistered} + one registry session per {@link turn}.
 */
export class ObpNegotiatorClient {
  readonly registry: AgentRegistry | undefined;
  readonly namespace: string;
  readonly model: LanguageModel;
  readonly identityContext: Record<string, unknown> | undefined;
  readonly resolveEnv: ObpNegotiatorResolveEnv | undefined;
  readonly toolPipelineHooks: ToolPipelineHooks | undefined;
  readonly systemInstructions: string | undefined;
  readonly defaultMaxSteps: number | undefined;

  constructor(options: ObpNegotiatorClientOptions) {
    this.registry = options.registry;
    this.namespace = options.namespace;
    this.model = options.model;
    this.identityContext = options.identityContext;
    this.resolveEnv = options.resolveEnv;
    this.toolPipelineHooks = options.toolPipelineHooks;
    this.systemInstructions = options.systemInstructions;
    this.defaultMaxSteps = options.defaultMaxSteps;
  }

  /**
   * Runs one OBP negotiator turn via the agent registry session.
   * Supply {@code resolveEnv} on the client or in {@code overrides} for each call.
   */
  async turn(args: {
    prompt: string;
    /** Per-call override of constructor / registry / env builder. */
    overrides?: ObpNegotiatorTurnOverrides;
  }): Promise<ObpNegotiatorSessionOutput> {
    const o = args.overrides ?? {};
    const registry = o.registry ?? this.registry;
    if (registry === undefined) {
      throw new Error(
        "ObpNegotiatorClient: pass registry in the constructor or in turn({ overrides: { registry } })",
      );
    }
    const namespace = o.namespace ?? this.namespace;
    const model = o.model ?? this.model;
    const resolveEnv = o.resolveEnv ?? this.resolveEnv;
    if (resolveEnv === undefined) {
      throw new Error(
        "ObpNegotiatorClient: pass resolveEnv in the constructor or in turn({ overrides: { resolveEnv } })",
      );
    }
    const { identity } = await ensureObpNegotiatorAgentRegistered(registry, namespace, {
      ...(this.identityContext !== undefined ? { identityContext: this.identityContext } : {}),
    });

    const session = registry.createSession(identity.agentId, {
      ctx: {
        model,
        resolveEnv,
        systemInstructions: o.systemInstructions ?? this.systemInstructions,
        defaultMaxSteps: o.defaultMaxSteps ?? this.defaultMaxSteps,
        toolPipelineHooks: o.toolPipelineHooks ?? this.toolPipelineHooks,
      },
    });
    return session.start<ObpNegotiatorSessionInput, ObpNegotiatorSessionOutput>({
      prompt: args.prompt,
    });
  }

  static negotiatorAgentId(namespace: string): string {
    return buildObpNegotiatorAgentId(namespace);
  }
}
