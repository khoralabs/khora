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
    cancelJob: (jobId) => {
      void fetch(`${JOBS_API_BASE}/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        credentials: "include",
      }).catch(() => undefined);
    },
    parseEvent: parseExedraInvestigationJobEvent,
  });
}
