import { getChatService } from "../chat/service";
import { getDb } from "../db/index";
import { getSession } from "../db/sessions";
import { getDocumentById } from "../documents/db";
import { requireInternalToken } from "../http/require-internal-token";
import { namespaceMatchesGrantResource } from "../memories/access";
import { requireAuthzServiceClient } from "./service-client";

type DecideBody = {
  subject?: { type?: string; id?: string };
  action?: string;
  resource?: Record<string, unknown>;
};

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init);
}

async function readBody(req: Request): Promise<DecideBody | null> {
  try {
    return (await req.json()) as DecideBody;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const APP_HANDLED_ACTIONS = new Set(["memory.read", "document.read", "chat.thread.write"]);

async function decideWithCentralService(body: DecideBody): Promise<boolean | null> {
  if (body.action !== undefined && APP_HANDLED_ACTIONS.has(body.action)) return null;
  if (body.action === undefined || body.resource === undefined) return null;

  const resourceType =
    stringField(body.resource, "type") ?? stringField(body.resource, "resourceType");
  const resourceId = stringField(body.resource, "id") ?? stringField(body.resource, "resourceId");
  const subjectType = body.subject?.type;
  const subjectId = body.subject?.id;
  if (
    resourceType === null ||
    resourceId === null ||
    typeof subjectType !== "string" ||
    typeof subjectId !== "string"
  ) {
    return null;
  }

  const result = await requireAuthzServiceClient().decide({
    subject: { type: subjectType, id: subjectId },
    action: body.action,
    resource: { type: resourceType, id: resourceId, ...body.resource },
  });
  return result.allowed;
}

function canReadMemoryNamespace(subject: DecideBody["subject"], resource: Record<string, unknown>) {
  const namespace = stringField(resource, "namespace");
  const resourceType = stringField(resource, "resourceType");
  const resourceId = stringField(resource, "resourceId");
  if (namespace === null || resourceType === null || resourceId === null) return false;

  const grantResource = { type: resourceType, id: resourceId };
  const context = {
    orgId: subject?.type === "agent" ? subject.id : undefined,
    userId: resourceType === "account" ? resourceId : undefined,
  };
  if (!namespaceMatchesGrantResource(namespace, grantResource, context)) return false;

  if (resourceType === "session") return getSession(getDb(), resourceId) !== null;
  return true;
}

async function canWriteChatThread(resource: Record<string, unknown>) {
  const threadId = stringField(resource, "id");
  if (threadId === null) return false;
  try {
    await getChatService().getThread(threadId);
    return true;
  } catch {
    return false;
  }
}

function canReadDocument(resource: Record<string, unknown>) {
  const documentId = stringField(resource, "id");
  return documentId !== null && getDocumentById(getDb(), documentId) !== null;
}

export async function handleInternalAuthzDecide(req: Request): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const body = await readBody(req);
  if (body?.action === undefined || body.resource === undefined) {
    return json({ error: "action and resource are required" }, { status: 400 });
  }

  let allowed = await decideWithCentralService(body);
  if (allowed !== null) return json({ allowed });

  allowed = false;
  if (body.action === "memory.read") {
    allowed = canReadMemoryNamespace(body.subject, body.resource);
  } else if (body.action === "document.read") {
    allowed = canReadDocument(body.resource);
  } else if (body.action === "chat.thread.write") {
    allowed = await canWriteChatThread(body.resource);
  }

  return json({ allowed });
}
