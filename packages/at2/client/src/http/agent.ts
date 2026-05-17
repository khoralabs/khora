import {
  type AtriumPost,
  zAgentStatusResponse,
} from "@khoralabs/at2-contracts";
import type { At2UnaryTransport } from "@khoralabs/at2-transport";

export type AgentStatusSnapshot = ReturnType<typeof zAgentStatusResponse.parse>;

export async function getAgentStatus(t: At2UnaryTransport): Promise<AtriumPost | null> {
  const out = await t.requestJson("GET", "/v1/agent/status", { parse: zAgentStatusResponse });
  return out.status;
}
