import { logger } from "../logger.js";
import { elapsedMs } from "../timing.js";
import type { RegisteredAgentIdentity } from "./types.js";

type MaybePromise<T> = T | Promise<T>;

export type SessionContext = Record<string, unknown>;

export type SessionContextResolverArgs<Input = unknown> = {
  agent: RegisteredAgentIdentity;
  input: Input;
  context: SessionContext;
};

export type SessionContextInput<Input = unknown> =
  | SessionContext
  | ((args: SessionContextResolverArgs<Input>) => MaybePromise<SessionContext | undefined>);

export type AgentSessionHooks<
  Input = unknown,
  Output = unknown,
  Context extends SessionContext = SessionContext,
> = {
  onStart?: (args: { agent: RegisteredAgentIdentity; input: Input }) => MaybePromise<void>;
  onAfterIdentity?: (args: { agent: RegisteredAgentIdentity; input: Input }) => MaybePromise<void>;
  onAfterContext?: (args: {
    agent: RegisteredAgentIdentity;
    input: Input;
    context: Context;
  }) => MaybePromise<void>;
  onBeforeRun?: (args: {
    agent: RegisteredAgentIdentity;
    input: Input;
    context: Context;
  }) => MaybePromise<void>;
  onAfterRun?: (args: {
    agent: RegisteredAgentIdentity;
    input: Input;
    context: Context;
    output: Output;
  }) => MaybePromise<void>;
  onError?: (args: {
    agent: RegisteredAgentIdentity;
    input: Input;
    context: Context;
    error: unknown;
  }) => MaybePromise<void>;
};

export type SessionRunner<
  Input = unknown,
  Output = unknown,
  Context extends SessionContext = SessionContext,
> = (args: {
  agent: RegisteredAgentIdentity;
  input: Input;
  context: Context;
}) => MaybePromise<Output>;

/**
 * Runner type for {@link RegisterAgentOptions.run} / {@link RegisteredAgentEntry.run}.
 * Uses a method-style key so `input` is checked **bivariantly**; then a concrete
 * `SessionRunner<SpecificInput, SpecificOutput>` assigns without casts while `start()` still passes `unknown` through at runtime.
 */
export type RegisteredSessionRunner = {
  bivarianceHack(args: {
    agent: RegisteredAgentIdentity;
    input: unknown;
    context: SessionContext;
  }): MaybePromise<unknown>;
}["bivarianceHack"];

export type RegisterAgentOptions<
  Input = unknown,
  Output = unknown,
  Context extends SessionContext = SessionContext,
> = {
  hooks?: AgentSessionHooks<Input, Output, Context>;
  ctx?: SessionContextInput<Input> | SessionContextInput<Input>[];
  run?: RegisteredSessionRunner;
};

export type CreateSessionOptions<
  Input = unknown,
  Output = unknown,
  Context extends SessionContext = SessionContext,
> = {
  hooks?: AgentSessionHooks<Input, Output, Context>;
  ctx?: SessionContextInput<Input> | SessionContextInput<Input>[];
  run?: RegisteredSessionRunner;
};

/** Hooks are widened for heterogeneous storage; invocation stays `unknown` at runtime (see `runStage`). */
export type RegisteredAgentEntry = {
  agent: RegisteredAgentIdentity;
  hooks?: AgentSessionHooks<unknown, unknown, SessionContext>;
  ctx?: SessionContextInput[];
  run?: RegisteredSessionRunner;
};

export type AgentSession = {
  readonly agentId: string;
  onStart: (hook: NonNullable<AgentSessionHooks["onStart"]>) => AgentSession;
  onAfterIdentity: (hook: NonNullable<AgentSessionHooks["onAfterIdentity"]>) => AgentSession;
  onAfterContext: (hook: NonNullable<AgentSessionHooks["onAfterContext"]>) => AgentSession;
  onBeforeRun: (hook: NonNullable<AgentSessionHooks["onBeforeRun"]>) => AgentSession;
  onAfterRun: (hook: NonNullable<AgentSessionHooks["onAfterRun"]>) => AgentSession;
  onError: (hook: NonNullable<AgentSessionHooks["onError"]>) => AgentSession;
  start: <Input = unknown, Output = unknown>(input: Input) => Promise<Output>;
};

export type AgentRegistry = {
  register: <Input = unknown, Output = unknown, Context extends SessionContext = SessionContext>(
    agent: RegisteredAgentIdentity,
    options?: RegisterAgentOptions<Input, Output, Context>,
  ) => { staticHash: string };
  createSession: <
    Input = unknown,
    Output = unknown,
    Context extends SessionContext = SessionContext,
  >(
    agentId: string,
    options?: CreateSessionOptions<Input, Output, Context>,
  ) => AgentSession;
  get: (agentId: string) => RegisteredAgentEntry | undefined;
  has: (agentId: string) => boolean;
  listKeys: () => string[];
  entries: () => IterableIterator<[string, RegisteredAgentEntry]>;
};

function toArray<T>(value?: T | T[]): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mergeContext(base: SessionContext, extra?: SessionContext): SessionContext {
  return extra ? { ...base, ...extra } : base;
}

/**
 * In-memory agent registration map keyed by `agentId`.
 */
export function createAgentRegistry(): AgentRegistry {
  const byId = new Map<string, RegisteredAgentEntry>();

  function register<
    Input = unknown,
    Output = unknown,
    Context extends SessionContext = SessionContext,
  >(
    agent: RegisteredAgentIdentity,
    options: RegisterAgentOptions<Input, Output, Context> = {},
  ): { staticHash: string } {
    byId.set(agent.agentId, {
      agent,
      hooks: options.hooks as RegisteredAgentEntry["hooks"],
      ctx: toArray(options.ctx) as RegisteredAgentEntry["ctx"],
      run: options.run,
    });
    return { staticHash: agent.staticHash };
  }

  function createSession<
    Input = unknown,
    Output = unknown,
    Context extends SessionContext = SessionContext,
  >(agentId: string, options: CreateSessionOptions<Input, Output, Context> = {}): AgentSession {
    const entry = byId.get(agentId);
    if (!entry) {
      throw new Error(`agent not registered: ${agentId}`);
    }
    const registered = entry;
    const sessionHooks: AgentSessionHooks = {};
    const sessionCtx = toArray(options.ctx);
    const sessionRun = options.run;

    async function runStage(
      stage: keyof AgentSessionHooks,
      args:
        | { agent: RegisteredAgentIdentity; input: unknown }
        | { agent: RegisteredAgentIdentity; input: unknown; context: SessionContext }
        | {
            agent: RegisteredAgentIdentity;
            input: unknown;
            context: SessionContext;
            output: unknown;
          }
        | {
            agent: RegisteredAgentIdentity;
            input: unknown;
            context: SessionContext;
            error: unknown;
          },
    ): Promise<void> {
      const hooks = [registered.hooks?.[stage], options.hooks?.[stage], sessionHooks[stage]].filter(
        Boolean,
      ) as Array<(a: unknown) => MaybePromise<void>>;
      for (const hook of hooks) {
        await hook(args);
      }
    }

    async function resolveContext(input: unknown): Promise<SessionContext> {
      let merged: SessionContext = { ...(registered.agent.staticContext ?? {}) };
      const allCtx = [...(registered.ctx ?? []), ...sessionCtx];
      for (const piece of allCtx) {
        if (typeof piece === "function") {
          const resolved = await (
            piece as (args: SessionContextResolverArgs) => MaybePromise<SessionContext | undefined>
          )({
            agent: registered.agent,
            input,
            context: merged,
          });
          if (resolved) {
            merged = mergeContext(merged, resolved);
          }
        } else {
          merged = mergeContext(merged, piece);
        }
      }
      return merged;
    }

    const session: AgentSession = {
      agentId,
      onStart(hook) {
        sessionHooks.onStart = hook;
        return session;
      },
      onAfterIdentity(hook) {
        sessionHooks.onAfterIdentity = hook;
        return session;
      },
      onAfterContext(hook) {
        sessionHooks.onAfterContext = hook;
        return session;
      },
      onBeforeRun(hook) {
        sessionHooks.onBeforeRun = hook;
        return session;
      },
      onAfterRun(hook) {
        sessionHooks.onAfterRun = hook;
        return session;
      },
      onError(hook) {
        sessionHooks.onError = hook;
        return session;
      },
      async start<Input = unknown, Output = unknown>(input: Input): Promise<Output> {
        const agent = registered.agent;
        await runStage("onStart", { agent, input });
        await runStage("onAfterIdentity", { agent, input });
        const context = await resolveContext(input);
        await runStage("onAfterContext", { agent, input, context });
        await runStage("onBeforeRun", { agent, input, context });
        const runner = sessionRun ?? registered.run;
        if (!runner) {
          throw new Error(`no session runner configured for agent: ${agentId}`);
        }
        try {
          const tRun = performance.now();
          const output = (await runner({ agent, input, context })) as Output;
          logger.info({
            phase: "agentSession.runner",
            durationMs: elapsedMs(tRun),
            agentId,
            name: agent.name,
            staticHash: agent.staticHash,
          });
          await runStage("onAfterRun", { agent, input, context, output });
          return output;
        } catch (error) {
          await runStage("onError", { agent, input, context, error });
          throw error;
        }
      },
    };
    return session;
  }

  function get(agentId: string): RegisteredAgentEntry | undefined {
    return byId.get(agentId);
  }

  function has(agentId: string): boolean {
    return byId.has(agentId);
  }

  function listKeys(): string[] {
    return [...byId.keys()];
  }

  function entries(): IterableIterator<[string, RegisteredAgentEntry]> {
    return byId.entries();
  }

  return {
    register,
    createSession,
    get,
    has,
    listKeys,
    entries,
  };
}
