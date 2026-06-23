import { Render } from "@renderinc/sdk";

import type {
  AppendJobEventsRequest,
  CompleteJobRequest,
  FailJobRequest,
  JobEvent,
} from "../../../../shared/jobs.ts";
import { requireRegistrySessionResponse } from "../auth/require-session.js";
import { getDb } from "../db/index.js";
import { requireInternalToken } from "../http/require-internal-token.js";
import { getOrCreateUser } from "../identity/users.js";
import { logger } from "../logger.js";

import { appendJobEvents, getJob, getLatestJobEventSeq, setJobStatus } from "./db.js";
import { createJobEventStream } from "./sse.js";

function parseLastEventId(req: Request): number {
  const header = req.headers.get("last-event-id")?.trim();
  if (header === undefined || header.length === 0) return 0;
  const parsed = Number(header);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

async function resolveAuthedUserId(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const auth = await requireRegistrySessionResponse(req);
  if (auth.response !== null) return { ok: false, response: auth.response };

  const db = getDb();
  const user = await getOrCreateUser(db, auth.session.user.id);
  return { ok: true, userId: user.id };
}

function requireJobOwner(
  job: NonNullable<ReturnType<typeof getJob>>,
  userId: string,
): Response | null {
  if (job.ownerUserId !== userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function handleGetJob(req: Request, jobId: string): Promise<Response> {
  const auth = await resolveAuthedUserId(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const job = getJob(db, jobId);
  if (job === null) return Response.json({ error: "Job not found" }, { status: 404 });

  const ownerError = requireJobOwner(job, auth.userId);
  if (ownerError !== null) return ownerError;

  return Response.json({
    status: job.status,
    result: job.result,
    error: job.error,
  });
}

export async function handleGetJobStream(req: Request, jobId: string): Promise<Response> {
  const auth = await resolveAuthedUserId(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const job = getJob(db, jobId);
  if (job === null) return Response.json({ error: "Job not found" }, { status: 404 });

  const ownerError = requireJobOwner(job, auth.userId);
  if (ownerError !== null) return ownerError;

  const fromSeq = parseLastEventId(req);
  const stream = createJobEventStream(db, jobId, fromSeq, req.signal);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function handleDeleteJob(req: Request, jobId: string): Promise<Response> {
  const auth = await resolveAuthedUserId(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  const job = getJob(db, jobId);
  if (job === null) return Response.json({ error: "Job not found" }, { status: 404 });

  const ownerError = requireJobOwner(job, auth.userId);
  if (ownerError !== null) return ownerError;

  if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
    return Response.json({ ok: true, status: job.status });
  }

  if (job.taskRunId !== null && job.taskRunId.length > 0) {
    const apiKey = process.env.RENDER_API_KEY?.trim();
    if (apiKey !== undefined && apiKey.length > 0) {
      const render = new Render({ token: apiKey });
      await render.workflows.cancelTaskRun(job.taskRunId).catch((err) => {
        logger.warn({ err, jobId, taskRunId: job.taskRunId }, "job cancel: task run cancel failed");
      });
    }
  }

  appendJobEvents(db, jobId, [{ type: "status", status: "cancelled" }]);
  setJobStatus(db, jobId, "cancelled");
  return Response.json({ ok: true, status: "cancelled" });
}

export async function handleInternalAppendJobEvents(
  req: Request,
  jobId: string,
): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: AppendJobEventsRequest;
  try {
    body = (await req.json()) as AppendJobEventsRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return Response.json({ error: "missing events" }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (job === null) return Response.json({ error: "Job not found" }, { status: 404 });

  const records = appendJobEvents(db, jobId, body.events as JobEvent[]);
  return Response.json({ appended: records.length, latestSeq: getLatestJobEventSeq(db, jobId) });
}

export async function handleInternalCompleteJob(req: Request, jobId: string): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: CompleteJobRequest;
  try {
    body = (await req.json()) as CompleteJobRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (job === null) return Response.json({ error: "Job not found" }, { status: 404 });

  if (body.events !== undefined && body.events.length > 0) {
    appendJobEvents(db, jobId, body.events);
  }

  const updated = setJobStatus(db, jobId, "done", { result: body.result ?? null, error: null });
  return Response.json({ ok: true, status: updated?.status ?? "done" });
}

export async function handleInternalFailJob(req: Request, jobId: string): Promise<Response> {
  const authError = requireInternalToken(req);
  if (authError !== null) return authError;

  let body: FailJobRequest;
  try {
    body = (await req.json()) as FailJobRequest;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const error = body.error?.trim();
  if (error === undefined || error.length === 0) {
    return Response.json({ error: "missing error" }, { status: 400 });
  }

  const db = getDb();
  const job = getJob(db, jobId);
  if (job === null) return Response.json({ error: "Job not found" }, { status: 404 });

  if (body.events !== undefined && body.events.length > 0) {
    appendJobEvents(db, jobId, body.events);
  }
  appendJobEvents(db, jobId, [{ type: "error", error }]);

  const updated = setJobStatus(db, jobId, "failed", { error });
  return Response.json({ ok: true, status: updated?.status ?? "failed" });
}
