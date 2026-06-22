/** JSON-serializable params passed from Exedra to the integrateBelief workflow task. */
export type BeliefIntegrationParams = {
  userId: string;
  sessionId: string;
  beliefId: string;
  beliefText: string;
  feedback: "confirmed" | "corrected";
  correction?: string;
  /** Org that owns the team session knowledge graph. */
  orgId: string;
  teamId: string;
  /** Team session namespace (org/{orgId}/team/{teamId}/session/{sessionId}). */
  namespace: string;
  /** Participant session namespace in personal knowledge ({userId}/org/...). */
  personalNamespace: string;
};

export type SearchHitSummary = {
  key: string;
  namespace: string;
  snippet: string;
  score?: number;
};

export type InternalMemoriesSearchRequest = {
  userId: string;
  query: string;
  topK?: number;
  namespace?: string;
  orgId?: string;
};

export type InternalMemoriesSearchResponse = {
  hits: SearchHitSummary[];
  namespace: string;
};

export type ExpandedMemoryDraftWire = {
  plaintext: string;
  memoryKeySuggestion?: string;
  nodeLabelHints?: Record<string, unknown>;
  edgeLabelHints?: Record<string, unknown>[];
};

export type IntegratorPlanWireJson = {
  nodeLabels: Record<string, unknown>;
  edges: Record<string, unknown>[];
  properties?: Record<string, unknown>;
};

export type LogicalMemoryWire = {
  key: string;
  namespace: string;
  plaintext: string;
};

export type InternalMemoriesMergeRequest = {
  userId: string;
  logicalMemory: LogicalMemoryWire;
  mode: "bootstrap" | "plan";
  draft?: ExpandedMemoryDraftWire;
  plan?: IntegratorPlanWireJson;
  /** Neighbor memory keys discovered during integrator search; filters semantic edges on merge. */
  allowedPeerKeys?: string[];
  orgId?: string;
};

export type InternalMemoriesMergeResponse = {
  memoryKey: string;
  namespace: string;
};

export type {
  InternalMemoriesAgentSearchRequest,
  InternalMemoriesAgentSearchResponse,
  InternalMemoriesProvenanceHeadResponse,
  SearchContentWire,
  SearchHitWire,
  SearchParamsWire,
} from "./search-hit-wire.ts";
