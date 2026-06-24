import { createWorkflowAuthzClient } from "@khoralabs/exedra-workflows-shared/authz-client";
import type { ExedraInternalClient } from "./exedra-internal-client.ts";
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

export function createExedraAuthzClient(client: ExedraInternalClient): AuthzClient {
  const serviceUrl = process.env.AUTHZ_SERVICE_URL?.trim();
  if (serviceUrl !== undefined && serviceUrl.length > 0) {
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

  return {
    canReadMemoryNamespace: async (subject, namespace) => {
      const result = await client.post<{ allowed: boolean }>("/internal/authz/decide", {
        subject,
        action: "memory.read",
        resource: namespace,
      });
      return result.allowed;
    },
    canReadDocument: async (subject, documentId) => {
      const result = await client.post<{ allowed: boolean }>("/internal/authz/decide", {
        subject,
        action: "document.read",
        resource: { type: "document", id: documentId },
      });
      return result.allowed;
    },
    canWriteChatThread: async (subject, threadId) => {
      const result = await client.post<{ allowed: boolean }>("/internal/authz/decide", {
        subject,
        action: "chat.thread.write",
        resource: { type: "chat_thread", id: threadId },
      });
      return result.allowed;
    },
  };
}

export function createAllowAllAuthzClient(): AuthzClient {
  return {
    canReadMemoryNamespace: async () => true,
    canReadDocument: async () => true,
    canWriteChatThread: async () => true,
  };
}
