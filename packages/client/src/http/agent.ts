import { type KhoraPost, zAgentStatusResponse } from "@khoralabs/khora-contracts";
import { KHORA_HTTP_PATH } from "@khoralabs/khora-contracts/http";
import type { KhoraUnaryTransport } from "../transport";

export type AgentStatusSnapshot = ReturnType<typeof zAgentStatusResponse.parse>;

export async function getAgentStatus(t: KhoraUnaryTransport): Promise<KhoraPost | null> {
  const out = await t.requestJson("GET", KHORA_HTTP_PATH.agentStatus, {
    parse: zAgentStatusResponse,
  });
  return out.status;
}
