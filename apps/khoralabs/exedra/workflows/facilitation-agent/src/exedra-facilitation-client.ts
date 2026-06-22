import type { UIMessage } from "ai";

import type {
  AppendFacilitationMessageRequest,
  FacilitationParticipantContextWire,
} from "../../../shared/facilitation-internal.ts";

function internalBaseUrl(): string {
  const url = process.env.EXEDRA_INTERNAL_URL?.trim() ?? "http://127.0.0.1:3000";
  return url.replace(/\/$/, "");
}

function internalHeaders(): HeadersInit {
  const token = process.env.EXEDRA_INTERNAL_TOKEN?.trim() ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchParticipantContext(
  sessionId: string,
  participantUserId: string,
): Promise<FacilitationParticipantContextWire> {
  const res = await fetch(
    `${internalBaseUrl()}/internal/facilitation/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantUserId)}/context`,
    { headers: internalHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch facilitation context (${res.status})`);
  }
  return (await res.json()) as FacilitationParticipantContextWire;
}

export async function getFacilitationThreadId(sessionId: string): Promise<string> {
  const res = await fetch(
    `${internalBaseUrl()}/internal/facilitation/sessions/${encodeURIComponent(sessionId)}/thread`,
    { headers: internalHeaders() },
  );
  if (!res.ok) {
    throw new Error(`Failed to resolve facilitation thread (${res.status})`);
  }
  const body = (await res.json()) as { threadId: string };
  return body.threadId;
}

export async function appendFacilitationMessage(params: {
  threadId: string;
  jobId: string;
  assistantId: string;
  parts: UIMessage["parts"];
}): Promise<void> {
  const body: AppendFacilitationMessageRequest = {
    assistantId: params.assistantId,
    parts: params.parts,
  };
  const res = await fetch(
    `${internalBaseUrl()}/internal/facilitation/threads/${encodeURIComponent(params.threadId)}/messages?jobId=${encodeURIComponent(params.jobId)}`,
    {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to append facilitation message (${res.status})`);
  }
}
