import { type AtriumPost, zAgentStatusResponse } from "@khoralabs/atrium-contracts";
import type { AtriumUnaryTransport } from "@khoralabs/atrium-transport";

export type AgentStatusSnapshot = ReturnType<typeof zAgentStatusResponse.parse>;

export async function getAgentStatus(t: AtriumUnaryTransport): Promise<AtriumPost | null> {
  const out = await t.requestJson("GET", "/v1/agent/status", {
    parse: zAgentStatusResponse,
  });
  return out.status;
}
