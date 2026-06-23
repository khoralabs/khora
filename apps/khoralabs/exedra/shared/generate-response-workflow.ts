export type GenerateResponseKind = "interview" | "facilitation" | "thread_summary";

export type GenerateResponseUIMessage = {
  id: string;
  role: string;
  parts: Array<{ type: string } & Record<string, unknown>>;
  metadata?: unknown;
};

export type GenerateResponseWorkflowParams = {
  jobId?: string;
  responseId: string;
  kind: GenerateResponseKind;
  agent: {
    id: string;
    name: string;
    actingFor: { type: string; id: string };
  };
  model: {
    id: string;
    fallbackIds?: string[];
    maxSteps?: number;
  };
  context: {
    sessionId?: string;
    threadId?: string;
    userId?: string;
    orgId?: string;
    teamId?: string;
    messages: GenerateResponseUIMessage[];
    instructions?: string[];
    invocationContext?: Record<string, unknown>;
    sessionContext?: Record<string, unknown>;
  };
  access: {
    memoryNamespaces?: Array<{
      namespace: string;
      scope: "org" | "personal" | "session" | "thread";
      resourceType: string;
      resourceId: string;
    }>;
    documentIds?: string[];
    chatThread?: {
      threadId: string;
      write: boolean;
    };
    policyFlags?: Record<string, boolean>;
  };
  output: {
    mode: "message" | "summary" | "investigation";
    chat: {
      channelId?: string;
      threadId: string;
      postId?: string;
      streamDeltas: boolean;
    };
  };
};

export type GenerateResponseResult = {
  responseId: string;
  kind: GenerateResponseKind;
  chat: {
    threadId: string;
    postId: string;
    status: "complete" | "aborted";
  };
  message?: GenerateResponseUIMessage;
  summary?: string;
  structured?: unknown;
  capabilities: {
    staticHash: string;
    runtimeHash: string;
    invocationHash?: string;
    toolRefs: Array<{ toolKey: string; toolHash: string }>;
    envelopeId?: string;
  };
};
