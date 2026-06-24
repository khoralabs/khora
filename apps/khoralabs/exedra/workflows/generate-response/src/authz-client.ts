import { createWorkflowAuthzClient } from "@khoralabs/exedra-workflows-shared/authz-client";
import type { GenerateResponseWorkflowParams } from "./types.ts";

export type AuthzSubject = GenerateResponseWorkflowParams["agent"]["actingFor"];
export type MemoryNamespaceAccess = NonNullable<
  GenerateResponseWorkflowParams["access"]["memoryNamespaces"]
>[number];

export type AuthzClient = {
  canReadMemoryNamespace(subject: AuthzSubject, namespace: MemoryNamespaceAccess): Promise<boolean>;
  canReadDocument(subject: AuthzSubject, documentId: string): Promise<boolean>;
  canWriteChatThread(subject: AuthzSubject, threadId: string): Promise<boolean>;
};

export function createExedraAuthzClient(): AuthzClient {
  const authz = createWorkflowAuthzClient();
  return {
    canReadMemoryNamespace: async (subject, namespace) =>
      (
        await authz.decide({
          subject,
          action: "memory.read",
          resource: {
            type: namespace.resourceType,
            id: namespace.resourceId,
            ...namespace,
          },
        })
      ).allowed,
    canReadDocument: async (subject, documentId) =>
      (
        await authz.decide({
          subject,
          action: "document.read",
          resource: { type: "document", id: documentId },
        })
      ).allowed,
    canWriteChatThread: async (subject, threadId) =>
      (
        await authz.decide({
          subject,
          action: "chat.thread.write",
          resource: { type: "thread", id: threadId },
        })
      ).allowed,
  };
}

export function createAllowAllAuthzClient(): AuthzClient {
  return {
    canReadMemoryNamespace: async () => true,
    canReadDocument: async () => true,
    canWriteChatThread: async () => true,
  };
}
