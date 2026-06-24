import { EntityType, Feature, Relation } from "@khoralabs/exedra-authz";

import type { DocumentGrantResource } from "../documents/types.js";
import { ResourceType, sessionResource, threadResource } from "./policy.js";
import { requireAuthzServiceClient } from "./service-client.js";

export const EXEDRA_CONVERSATIONAL_AGENT_ID = "exedra-conversational-agent";

function agentScope(agentId: string = EXEDRA_CONVERSATIONAL_AGENT_ID) {
  return { type: EntityType.Agent, id: agentId };
}

function grantResourceEntity(resource: DocumentGrantResource) {
  return { type: resource.type, id: resource.id };
}

export async function ensureOrgAgentRepresents(orgId: string): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.relate({
    from: agentScope(),
    relation: Relation.Represents,
    to: { type: ResourceType.Organization, id: orgId },
  });
}

export async function grantAgentThreadWrite(
  threadId: string,
  agentId: string = EXEDRA_CONVERSATIONAL_AGENT_ID,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.grant({
    scope: agentScope(agentId),
    resource: threadResource(threadId),
    feature: Feature.Write,
  });
}

export async function grantAgentResourceRead(
  resource: { type: string; id: string },
  agentId: string = EXEDRA_CONVERSATIONAL_AGENT_ID,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.grant({
    scope: agentScope(agentId),
    resource,
    feature: Feature.Read,
  });
}

export async function publishDocumentProtectedBy(
  documentId: string,
  grantResource: DocumentGrantResource,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.relate({
    from: { type: EntityType.Document, id: documentId },
    relation: Relation.ProtectedBy,
    to: grantResourceEntity(grantResource),
  });
}

export async function publishSessionBelongsToTeam(
  sessionId: string,
  teamId: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.relate({
    from: { type: EntityType.Session, id: sessionId },
    relation: Relation.BelongsTo,
    to: { type: ResourceType.Team, id: teamId },
  });
}

export async function publishThreadBelongsToSession(
  threadId: string,
  sessionId: string,
): Promise<void> {
  const client = requireAuthzServiceClient();
  await client.relate({
    from: { type: EntityType.Thread, id: threadId },
    relation: Relation.BelongsTo,
    to: sessionResource(sessionId),
  });
}

export async function publishChatThreadAuthzFacts(args: {
  chatThreadId: string;
  sessionId: string;
  orgId: string;
}): Promise<void> {
  await ensureOrgAgentRepresents(args.orgId);
  await publishThreadBelongsToSession(args.chatThreadId, args.sessionId);
  await grantAgentThreadWrite(args.chatThreadId);
  await grantAgentResourceRead({ type: ResourceType.Organization, id: args.orgId });
  await grantAgentResourceRead({ type: ResourceType.Session, id: args.sessionId });
}

export async function publishAgentPersonalMemoryRead(
  ownerId: string,
  agentId: string = EXEDRA_CONVERSATIONAL_AGENT_ID,
): Promise<void> {
  await grantAgentResourceRead({ type: ResourceType.Account, id: ownerId }, agentId);
}

export async function decideChatThreadWrite(
  subject: { type: string; id: string },
  threadId: string,
): Promise<boolean> {
  const client = requireAuthzServiceClient();
  const result = await client.decide({
    subject,
    action: "chat.thread.write",
    resource: { type: ResourceType.Thread, id: threadId },
  });
  return result.allowed;
}
