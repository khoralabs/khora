import { task } from "@renderinc/sdk/workflows";
import {
  type BeliefIntegrationParams,
  postInternalMemoriesMerge,
  postInternalMemoriesSearch,
  resolveBeliefMemoryKey,
} from "./exedra-client.ts";
import { expandBelief } from "./expand-belief.ts";
import { expandDocument } from "./expand-document.ts";
import "./otel.ts";
import type {
  BatchIntegrationParams,
  DocumentIntegrationParams,
} from "../../../shared/document-processing.ts";
import { resolveDocumentMemoryKey } from "../../../shared/document-processing.ts";
import { integrateBatch } from "./integrate-batch.ts";
import { planDocumentIntegration } from "./plan-document-integration.ts";
import { planIntegration } from "./plan-integration.ts";

const retry = {
  maxRetries: 3,
  waitDurationMs: 2000,
  backoffScaling: 2.0,
};

const searchMemories = task(
  { name: "searchMemories", retry },
  async function searchMemories(userId: string, query: string) {
    return postInternalMemoriesSearch({ userId, query, topK: 10 });
  },
);

const expandBeliefTask = task(
  { name: "expandBelief", retry },
  async function expandBeliefTask(params: BeliefIntegrationParams, namespace: string) {
    return expandBelief({
      beliefText: params.beliefText,
      feedback: params.feedback,
      sessionId: params.sessionId,
      beliefId: params.beliefId,
      userId: params.userId,
      namespace,
    });
  },
);

const expandDocumentTask = task(
  { name: "expandDocument", retry },
  async function expandDocumentTask(params: DocumentIntegrationParams, namespace: string) {
    return expandDocument({ ...params, namespace });
  },
);

const planDocumentIntegrationTask = task(
  { name: "planDocumentIntegration", retry },
  async function planDocumentIntegrationTask(content: string, userId: string, namespace: string) {
    return planDocumentIntegration({ content, userId, namespace });
  },
);

const planIntegrationTask = task(
  { name: "planIntegration", retry },
  async function planIntegrationTask(content: string, userId: string, namespace: string) {
    return planIntegration({ content, userId, namespace });
  },
);

const mergeMemory = task(
  { name: "mergeMemory", retry },
  async function mergeMemory(
    params: BeliefIntegrationParams,
    namespace: string,
    draft: Awaited<ReturnType<typeof expandBeliefTask>>,
    mode: "bootstrap" | "plan",
    planResult?: Awaited<ReturnType<typeof planIntegrationTask>>,
  ) {
    const memoryKey = resolveBeliefMemoryKey(params.sessionId, params.beliefId);

    return postInternalMemoriesMerge({
      userId: params.userId,
      logicalMemory: {
        key: memoryKey,
        namespace,
        plaintext: draft.plaintext,
      },
      mode,
      ...(mode === "bootstrap" ? { draft } : {}),
      ...(mode === "plan" && planResult !== undefined
        ? { plan: planResult.plan, allowedPeerKeys: planResult.allowedPeerKeys }
        : {}),
    });
  },
);

const mergeDocumentMemory = task(
  { name: "mergeDocumentMemory", retry },
  async function mergeDocumentMemory(
    params: DocumentIntegrationParams,
    namespace: string,
    draft: Awaited<ReturnType<typeof expandDocumentTask>>,
    mode: "bootstrap" | "plan",
    planResult?: Awaited<ReturnType<typeof planDocumentIntegrationTask>>,
  ) {
    const memoryKey = resolveDocumentMemoryKey(
      params.batchId,
      params.documentId,
      params.chunkIndex,
    );

    return postInternalMemoriesMerge({
      userId: params.userId,
      logicalMemory: {
        key: memoryKey,
        namespace,
        plaintext: draft.plaintext,
      },
      mode,
      ...(mode === "bootstrap" ? { draft } : {}),
      ...(mode === "plan" && planResult !== undefined
        ? { plan: planResult.plan, allowedPeerKeys: planResult.allowedPeerKeys }
        : {}),
    });
  },
);

task(
  {
    name: "integrateBelief",
    retry: {
      maxRetries: 2,
      waitDurationMs: 3000,
      backoffScaling: 2.0,
    },
    timeoutSeconds: 300,
  },
  async function integrateBelief(params: BeliefIntegrationParams) {
    const beliefText = params.beliefText.trim();
    if (beliefText.length === 0) {
      throw new Error("beliefText is required");
    }

    const search = await searchMemories(params.userId, beliefText);
    const coldStart = search.hits.length === 0;

    const draft = await expandBeliefTask(params, search.namespace);

    if (coldStart) {
      return mergeMemory(params, search.namespace, draft, "bootstrap");
    }

    const planResult = await planIntegrationTask(draft.plaintext, params.userId, search.namespace);
    return mergeMemory(params, search.namespace, draft, "plan", planResult);
  },
);

task(
  {
    name: "integrateDocument",
    retry: {
      maxRetries: 2,
      waitDurationMs: 3000,
      backoffScaling: 2.0,
    },
    timeoutSeconds: 300,
  },
  async function integrateDocument(params: DocumentIntegrationParams) {
    const chunkText = params.chunkText.trim();
    if (chunkText.length === 0) {
      throw new Error("chunkText is required");
    }

    const search = await searchMemories(params.userId, chunkText);
    const coldStart = search.hits.length === 0;

    const draft = await expandDocumentTask(params, search.namespace);

    if (coldStart) {
      return mergeDocumentMemory(params, search.namespace, draft, "bootstrap");
    }

    const planResult = await planDocumentIntegrationTask(
      draft.plaintext,
      params.userId,
      search.namespace,
    );
    return mergeDocumentMemory(params, search.namespace, draft, "plan", planResult);
  },
);

task(
  {
    name: "integrateBatch",
    retry: {
      maxRetries: 2,
      waitDurationMs: 3000,
      backoffScaling: 2.0,
    },
    timeoutSeconds: 600,
  },
  async function integrateBatchTask(params: BatchIntegrationParams) {
    return integrateBatch(params);
  },
);
