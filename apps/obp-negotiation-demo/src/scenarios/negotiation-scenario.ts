import type { RegisteredAgentIdentity } from "@cfd/agent-identity";

export interface NegotiationScenario {
  title: string;
  /**
   * Ordered participants. Demos assume index 0 = provider/host (offer owner for deal detection),
   * index 1 = buyer/guest (may bind).
   */
  parties: RegisteredAgentIdentity[];
}
