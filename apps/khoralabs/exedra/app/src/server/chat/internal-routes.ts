import type { PostModelMetadata, PostUsage, ScopeRef } from "@khoralabs/chat-core";
import type { UIMessage } from "ai";

import { requireInternalToken } from "../http/require-internal-token";
import { getChatService } from "./service";

type StartStreamedPostBody = {
  author?: ScopeRef;
  idempotencyKey?: string;
  message?: UIMessage;
  threadId?: string;
};

type ApplyPostDeltaBody = {
  expectedRevision?: number;
  message?: UIMessage;
  model?: PostModelMetadata;
  usage?: PostUsage;
};

type CompleteStreamedPostBody = {
  expectedRevision?: number;
  idempotencyKey?: string;
};

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init);
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: message }, { status: 500 });
}

export async function handleInternalStartStreamedChatPost(
  req: Request,
  threadIdFromPath?: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const body = await readJson<StartStreamedPostBody>(req);
  const threadId = threadIdFromPath ?? body?.threadId;
  if (body?.author === undefined || body.message === undefined || threadId === undefined) {
    return json({ error: "threadId, author, and message are required" }, { status: 400 });
  }

  try {
    const result = await getChatService().startStreamedPost({
      threadId,
      author: body.author,
      idempotencyKey: body.idempotencyKey,
      message: body.message,
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleInternalApplyChatPostDelta(
  req: Request,
  postId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const body = await readJson<ApplyPostDeltaBody>(req);
  if (body?.message === undefined) {
    return json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await getChatService().applyPostDelta({
      postId,
      expectedRevision: body.expectedRevision,
      message: body.message,
      model: body.model,
      usage: body.usage,
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleInternalCompleteChatPostStream(
  req: Request,
  postId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  const body = await readJson<CompleteStreamedPostBody>(req);
  try {
    const result = await getChatService().completeStreamedPost({
      postId,
      expectedRevision: body?.expectedRevision,
      idempotencyKey: body?.idempotencyKey,
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleInternalAbortChatPostStream(
  req: Request,
  postId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  try {
    const post = await getChatService().abortStreamedPost({ postId });
    return json({ post });
  } catch (error) {
    return errorResponse(error);
  }
}
