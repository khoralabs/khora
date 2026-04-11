import type { AgentSessionHooks, RegisteredAgentIdentity } from "@cfd/agent-identity";
import type z from "zod";
import { logger } from "../telemetry/logger.js";
import { librarianLog } from "../telemetry/payloads.js";
import { elapsedMs } from "../timing.js";
import type {
  MemoryLibrarianSessionContext,
  MemoryLibrarianSessionInput,
  MemoryLibrarianSessionOutput,
} from "./memory-librarian-session.js";

const STACK_MAX = 2000;

function agentFields(agent: RegisteredAgentIdentity) {
  return {
    agentId: agent.agentId,
    agentName: agent.name,
    staticHash: agent.staticHash,
  };
}

function inputFields<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(input: MemoryLibrarianSessionInput<TNode, TEdge>) {
  return {
    namespace: input.logicalMemory.namespace,
    logicalKey: input.logicalMemory.key,
    runMerge: input.runMerge,
    maxSteps: input.maxSteps,
    prefetchHitCount: input.prefetchedHits.length,
    resolvedSourceCount: input.resolvedSources.length,
    mergeChunkCount: input.processedLogicalMemory.content.length,
  };
}

function contextFields<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(ctx: MemoryLibrarianSessionContext<TNode, TEdge>) {
  return {
    contextKeys: Object.keys(ctx).sort(),
    hasToolkitCtx: ctx.toolkitCtx !== undefined,
    hasRuntime: ctx.runtime !== undefined,
  };
}

function sessionDelta(sessionStartPerf: number): number {
  return performance.now() - sessionStartPerf;
}

/**
 * Session lifecycle logs (same logger as the rest of `@cfd/librarian`; `LOG_DESTINATION` duplicates to file).
 */
export function createMemoryLibrarianSessionAuditHooks<
  TNode extends Record<string, z.ZodType>,
  TEdge extends Record<string, z.ZodType>,
>(): AgentSessionHooks<
  MemoryLibrarianSessionInput<TNode, TEdge>,
  MemoryLibrarianSessionOutput,
  MemoryLibrarianSessionContext<TNode, TEdge>
> {
  let sessionStartPerf = 0;

  return {
    onStart: async ({ agent, input }) => {
      const t0 = performance.now();
      sessionStartPerf = performance.now();
      logger.info(
        librarianLog("librarian.agentSession.onStart", {
          processTimeMs: elapsedMs(t0),
          sessionDeltaMs: 0,
          ...agentFields(agent),
          ...inputFields(input),
        }),
      );
    },

    onAfterIdentity: async ({ agent, input }) => {
      const t0 = performance.now();
      const inp = input as MemoryLibrarianSessionInput<TNode, TEdge>;
      logger.info(
        librarianLog("librarian.agentSession.onAfterIdentity", {
          processTimeMs: elapsedMs(t0),
          sessionDeltaMs: sessionDelta(sessionStartPerf),
          ...agentFields(agent),
          ...inputFields(inp),
        }),
      );
    },

    onAfterContext: async ({ agent, input, context }) => {
      const t0 = performance.now();
      logger.info(
        librarianLog("librarian.agentSession.onAfterContext", {
          processTimeMs: elapsedMs(t0),
          sessionDeltaMs: sessionDelta(sessionStartPerf),
          ...agentFields(agent),
          ...inputFields(input),
          ...contextFields(context),
        }),
      );
    },

    onBeforeRun: async ({ agent, input, context }) => {
      const t0 = performance.now();
      logger.info(
        librarianLog("librarian.agentSession.onBeforeRun", {
          processTimeMs: elapsedMs(t0),
          sessionDeltaMs: sessionDelta(sessionStartPerf),
          ...agentFields(agent),
          ...inputFields(input),
          ...contextFields(context),
        }),
      );
    },

    onAfterRun: async ({ agent, input, context, output }) => {
      const t0 = performance.now();
      const out = output as MemoryLibrarianSessionOutput;
      logger.info(
        librarianLog("librarian.agentSession.onAfterRun", {
          processTimeMs: elapsedMs(t0),
          sessionDeltaMs: sessionDelta(sessionStartPerf),
          ...agentFields(agent),
          ...inputFields(input),
          ...contextFields(context),
          finishReason: out.generation.finishReason,
          toolLoopStepCount: out.generation.steps.length,
          hasPlan: out.plan != null,
        }),
      );
    },

    onError: async ({ agent, input, context, error }) => {
      const t0 = performance.now();
      const err = error instanceof Error ? error : new Error(String(error));
      const stack = err.stack;
      logger.info(
        librarianLog("librarian.agentSession.onError", {
          processTimeMs: elapsedMs(t0),
          sessionDeltaMs: sessionDelta(sessionStartPerf),
          ...agentFields(agent),
          ...inputFields(input),
          ...contextFields(context),
          errorMessage: err.message,
          errorType: err.name,
          ...(stack ? { errorStack: stack.slice(0, STACK_MAX) } : {}),
        }),
      );
    },
  };
}
