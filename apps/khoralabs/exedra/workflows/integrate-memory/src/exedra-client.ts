import type {
  BeliefIntegrationParams,
  InternalMemoriesMergeRequest,
  InternalMemoriesMergeResponse,
  InternalMemoriesSearchRequest,
  InternalMemoriesSearchResponse,
} from "./belief-integration.ts";

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

export async function postInternalMemoriesSearch(
  body: InternalMemoriesSearchRequest,
): Promise<InternalMemoriesSearchResponse> {
  const res = await fetch(`${baseUrl()}/internal/memories/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return readJson<InternalMemoriesSearchResponse>(res);
}

export async function postInternalMemoriesMerge(
  body: InternalMemoriesMergeRequest,
): Promise<InternalMemoriesMergeResponse> {
  const res = await fetch(`${baseUrl()}/internal/memories/merge`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return readJson<InternalMemoriesMergeResponse>(res);
}

export function resolveBeliefMemoryKey(sessionId: string, beliefId: string): string {
  return `beliefs/${sessionId}/${beliefId}`;
}

export type { BeliefIntegrationParams };
