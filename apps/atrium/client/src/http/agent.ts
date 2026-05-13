import {
  type AtriumPost,
  zAgentStatusResponse,
  zAtriumPost,
  zAtriumProfile,
} from "@khoralabs/atrium-contracts";
import z from "zod";
import type { HttpTransport } from "./transport.ts";

const zAgentSyncSnapshot = z.object({
  profile: zAtriumProfile,
  topicSlugs: z.array(z.string()),
  authorTopics: z.array(z.object({ authorDid: z.string(), topicSlug: z.string() })).default([]),
  probes: z.array(zAtriumPost),
});

export type AgentSyncSnapshot = z.infer<typeof zAgentSyncSnapshot>;

export type AgentStatusSnapshot = z.infer<typeof zAgentStatusResponse>;

export function fetchAgentSync(t: HttpTransport): Promise<AgentSyncSnapshot> {
  return t.requestJson("GET", "/v1/agent/sync", { parse: zAgentSyncSnapshot });
}

export async function getAgentStatus(t: HttpTransport): Promise<AtriumPost | null> {
  const out = await t.requestJson("GET", "/v1/agent/status", { parse: zAgentStatusResponse });
  return out.status;
}
