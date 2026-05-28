import { type KhoraPost, zAgentStatusResponse } from "@khoralabs/khora-contracts";
import type { KhoraUnaryTransport } from "@khoralabs/khora-transport";

export type AgentStatusSnapshot = ReturnType<typeof zAgentStatusResponse.parse>;

export async function getAgentStatus(t: KhoraUnaryTransport): Promise<KhoraPost | null> {
  const out = await t.requestJson("GET", "/v1/agent/status", {
    parse: zAgentStatusResponse,
  });
  return out.status;
}
