import type { MemoryNamespaceAccess } from "../authz-client.ts";

export type GenerateResponsePolicyState = {
  memoryNamespaces: MemoryNamespaceAccess[];
  documentIds: string[];
  canWriteChatThread: boolean;
  skillNames: string[];
  flags: Record<string, boolean>;
};
