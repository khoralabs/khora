import { expandedDraftToLogicalMemoryInput } from "@khoralabs/memories-adapter";
import { task } from "@renderinc/sdk/workflows";
import {
  type BeliefIntegrationParams,
  postInternalMemoriesMerge,
  postInternalMemoriesSearch,
  resolveBeliefMemoryKey,
} from "./exedra-client.ts";
import { expandBelief } from "./expand-belief.ts";
import "./otel.ts";
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
    plan?: Awaited<ReturnType<typeof planIntegrationTask>>,
  ) {
    const defaultKey = resolveBeliefMemoryKey(params.sessionId, params.beliefId);
    const logicalMemory = expandedDraftToLogicalMemoryInput(draft, namespace, defaultKey);

    return postInternalMemoriesMerge({
      userId: params.userId,
      logicalMemory: {
        key: logicalMemory.key,
        namespace: logicalMemory.namespace,
        plaintext: logicalMemory.plaintext ?? draft.plaintext,
      },
      mode,
      ...(mode === "bootstrap" ? { draft } : {}),
      ...(mode === "plan" && plan !== undefined ? { plan } : {}),
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

    const plan = await planIntegrationTask(draft.plaintext, params.userId, search.namespace);
    return mergeMemory(params, search.namespace, draft, "plan", plan);
  },
);
