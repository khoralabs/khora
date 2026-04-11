import type { LanguageModelUsage } from "ai";

export const LOGGER_NAME = "librarian" as const;

/** Discriminated union of all structured log lines for `@cfd/memories-librarian`. */
export type LibrarianLogPayloadMap = {
  // --- remember (pipeline) ---
  "librarian.remember.decompose": {
    processTimeMs: number;
    mergeChunkCount: number;
    namespace: string;
  };
  "librarian.remember.prefetchSearch": {
    processTimeMs: number;
    mergeChunkCount: number;
    prefetchHitCount: number;
    skipped: boolean;
  };
  "librarian.remember.resolveSources": {
    processTimeMs: number;
    resolvedCount: number;
  };
  "librarian.remember.registerAgent": {
    processTimeMs: number;
    agentId: string;
  };
  "librarian.remember.sessionStart": {
    processTimeMs: number;
    agentId: string;
    maxSteps: number;
  };
  "librarian.remember.pipeline": {
    processTimeMs: number;
    namespace: string;
  };

  // --- runner (memory librarian session runner) ---
  "librarian.runner.evaluateAffordances": {
    processTimeMs: number;
    toolCount: number;
  };
  "librarian.runner.toolLoopGenerate": {
    processTimeMs: number;
    stepCount: number;
    finishReason: unknown;
  };
  "librarian.runner.mergeMemory": {
    processTimeMs: number;
  };

  // --- toolLoop (AI SDK loop) ---
  "librarian.toolLoop.step": {
    processTimeMs: number;
    stepNumber: number;
    finishReason: unknown;
    toolCallCount: number;
    toolNames: string[];
    usage: LanguageModelUsage;
    textLength: number;
  };
  "librarian.toolLoop.finish": {
    processTimeMs: number;
    stepCount: number;
    totalUsage: LanguageModelUsage;
    finishReason: unknown;
  };

  // --- toolkit ---
  "librarian.toolkit.toolCall": {
    processTimeMs: number;
    toolName: string;
    ok: boolean;
    input: unknown;
    outputSummary?: { hitCount: number; memoryKeys: string[] };
    error?: unknown;
  };
  "librarian.toolkit.memory_search": {
    processTimeMs: number;
    embedMs: number;
    searchMs: number;
    embedCacheHit: boolean;
    hitCount: number;
  };

  // --- embed (debug) ---
  "librarian.embed.textChunks": {
    processTimeMs: number;
    textCount: number;
    model: string;
  };
  "librarian.embed.binaryBlob": {
    processTimeMs: number;
    model: string;
  };

  // --- agent session lifecycle (registry hooks) ---
  "librarian.agentSession.onStart": {
    processTimeMs: number;
    sessionDeltaMs: number;
    agentId: string;
    agentName: string;
    staticHash: string;
    namespace: string;
    logicalKey: string;
    runMerge: boolean;
    maxSteps: number;
    prefetchHitCount: number;
    resolvedSourceCount: number;
    mergeChunkCount: number;
  };
  "librarian.agentSession.onAfterIdentity": {
    processTimeMs: number;
    sessionDeltaMs: number;
    agentId: string;
    agentName: string;
    staticHash: string;
    namespace: string;
    logicalKey: string;
    runMerge: boolean;
    maxSteps: number;
    prefetchHitCount: number;
    resolvedSourceCount: number;
    mergeChunkCount: number;
  };
  "librarian.agentSession.onAfterContext": {
    processTimeMs: number;
    sessionDeltaMs: number;
    agentId: string;
    agentName: string;
    staticHash: string;
    namespace: string;
    logicalKey: string;
    runMerge: boolean;
    maxSteps: number;
    prefetchHitCount: number;
    resolvedSourceCount: number;
    mergeChunkCount: number;
    contextKeys: string[];
    hasToolkitCtx: boolean;
    hasRuntime: boolean;
  };
  "librarian.agentSession.onBeforeRun": {
    processTimeMs: number;
    sessionDeltaMs: number;
    agentId: string;
    agentName: string;
    staticHash: string;
    namespace: string;
    logicalKey: string;
    runMerge: boolean;
    maxSteps: number;
    prefetchHitCount: number;
    resolvedSourceCount: number;
    mergeChunkCount: number;
    contextKeys: string[];
    hasToolkitCtx: boolean;
    hasRuntime: boolean;
  };
  "librarian.agentSession.onAfterRun": {
    processTimeMs: number;
    sessionDeltaMs: number;
    agentId: string;
    agentName: string;
    staticHash: string;
    namespace: string;
    logicalKey: string;
    runMerge: boolean;
    maxSteps: number;
    prefetchHitCount: number;
    resolvedSourceCount: number;
    mergeChunkCount: number;
    contextKeys: string[];
    hasToolkitCtx: boolean;
    hasRuntime: boolean;
    finishReason: unknown;
    toolLoopStepCount: number;
    hasPlan: boolean;
  };
  "librarian.agentSession.onError": {
    processTimeMs: number;
    sessionDeltaMs: number;
    agentId: string;
    agentName: string;
    staticHash: string;
    namespace: string;
    logicalKey: string;
    runMerge: boolean;
    maxSteps: number;
    prefetchHitCount: number;
    resolvedSourceCount: number;
    mergeChunkCount: number;
    contextKeys: string[];
    hasToolkitCtx: boolean;
    hasRuntime: boolean;
    errorMessage: string;
    errorType: string;
    errorStack?: string;
  };

  /** @internal tests */
  "librarian.test.probe": {
    processTimeMs: number;
    ok: boolean;
  };
};

export type LibrarianLogPhase = keyof LibrarianLogPayloadMap;

export type LibrarianLogEntry = {
  [P in keyof LibrarianLogPayloadMap]: { phase: P } & LibrarianLogPayloadMap[P];
}[keyof LibrarianLogPayloadMap];

/**
 * Build a typed log object: `logger.info(librarianLog(phase, payload))`.
 */
export function librarianLog<P extends keyof LibrarianLogPayloadMap>(
  phase: P,
  payload: LibrarianLogPayloadMap[P],
): { phase: P } & LibrarianLogPayloadMap[P] {
  return { phase, ...payload };
}
