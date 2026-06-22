import {
  createJobStreamInvestigatorClient,
  type GraphInvestigatorClient,
  type InvestigatorAnswer,
  type JobStreamInvestigationEvent,
} from "@khoralabs/memories-react-graph";

const JOBS_API_BASE = "/api/jobs";

function parseExedraInvestigationJobEvent(data: string): JobStreamInvestigationEvent | null {
  try {
    const parsed = JSON.parse(data) as
      | { type: "investigation_step"; message: string }
      | { type: "investigation_complete"; answer: InvestigatorAnswer }
      | { type: "error"; error: string };

    if (parsed.type === "investigation_step") {
      return { type: "progress", message: parsed.message };
    }
    if (parsed.type === "investigation_complete") {
      return { type: "complete", answer: parsed.answer };
    }
    if (parsed.type === "error") {
      return { type: "error", error: parsed.error };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeInvestigatorAnswer(result: unknown): InvestigatorAnswer | null {
  if (result === null || typeof result !== "object") return null;
  const answer = (result as InvestigatorAnswer).answer;
  if (typeof answer !== "string") return null;
  const normalized: InvestigatorAnswer = { answer };
  const citations = (result as InvestigatorAnswer).citations;
  if (citations !== undefined) normalized.citations = citations;
  const followUp = (result as InvestigatorAnswer).follow_up_queries;
  if (followUp !== undefined) normalized.follow_up_queries = followUp;
  return normalized;
}

async function fetchInvestigationResult(jobId: string): Promise<InvestigatorAnswer | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${JOBS_API_BASE}/${encodeURIComponent(jobId)}`, {
      credentials: "include",
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      status?: string;
      result?: unknown;
      error?: string;
    };

    if (json.status === "failed" && json.error !== undefined && json.error.length > 0) {
      throw new Error(json.error);
    }

    if (json.status === "done") {
      const answer = normalizeInvestigatorAnswer(json.result);
      if (answer !== null) return answer;
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return null;
}

export function createExedraInvestigatorClient(apiBase: string): GraphInvestigatorClient {
  return createJobStreamInvestigatorClient({
    startJob: async ({ namespace, question }) => {
      const res = await fetch(`${apiBase}/investigate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace, question }),
      });
      const json = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || json.error) {
        throw new Error(json.error ?? res.statusText);
      }
      if (json.jobId === undefined || json.jobId.length === 0) {
        throw new Error("Investigation did not return a job id");
      }
      return { jobId: json.jobId };
    },
    streamUrl: (jobId) => `${JOBS_API_BASE}/${encodeURIComponent(jobId)}/stream`,
    fetchCompleteAnswer: fetchInvestigationResult,
    cancelJob: (jobId) => {
      void fetch(`${JOBS_API_BASE}/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        credentials: "include",
      }).catch(() => undefined);
    },
    parseEvent: parseExedraInvestigationJobEvent,
  });
}
