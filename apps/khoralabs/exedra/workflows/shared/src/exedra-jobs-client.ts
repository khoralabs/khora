import type { HeadersInit } from "bun";
import type {
  AppendJobEventsRequest,
  CompleteJobRequest,
  FailJobRequest,
  JobEvent,
} from "../../../shared/jobs.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} environment variable not set`);
  }
  return value;
}

function baseUrl(): string {
  return requireEnv("EXEDRA_INTERNAL_URL").replace(/\/$/, "");
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireEnv("EXEDRA_INTERNAL_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error !== undefined && data.error.length > 0) message = data.error;
    } catch {
      if (text.length > 0) message = text;
    }
    throw new Error(message);
  }
  return JSON.parse(text) as T;
}

export async function postJobEvents(jobId: string, events: JobEvent[]): Promise<void> {
  if (events.length === 0) return;
  const body: AppendJobEventsRequest = { events };
  const res = await fetch(`${baseUrl()}/internal/jobs/${encodeURIComponent(jobId)}/events`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await readJson<{ appended: number }>(res);
}

export async function completeJob(
  jobId: string,
  args: { result?: unknown; events?: JobEvent[] } = {},
): Promise<void> {
  const body: CompleteJobRequest = {
    ...(args.result !== undefined ? { result: args.result } : {}),
    ...(args.events !== undefined ? { events: args.events } : {}),
  };
  const res = await fetch(`${baseUrl()}/internal/jobs/${encodeURIComponent(jobId)}/complete`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await readJson<{ ok: boolean }>(res);
}

export async function failJob(jobId: string, error: string, events?: JobEvent[]): Promise<void> {
  const body: FailJobRequest = {
    error,
    ...(events !== undefined ? { events } : {}),
  };
  const res = await fetch(`${baseUrl()}/internal/jobs/${encodeURIComponent(jobId)}/fail`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await readJson<{ ok: boolean }>(res);
}
