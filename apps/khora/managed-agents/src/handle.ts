import type { PersistableRelaySigner } from "@khoralabs/agent-persisted-signer";
import { KhoraClient } from "@khoralabs/khora-client";

export type AgentHandleOptions = {
  signer: PersistableRelaySigner;
  baseUrl: string;
};

/**
 * A focused handle for a single managed agent. Exposes its DID and a
 * ready-to-use KhoraClient authenticated as that agent.
 */
export class AgentHandle {
  readonly did: string;
  readonly client: KhoraClient;

  constructor(opts: AgentHandleOptions) {
    this.did = opts.signer.did;
    this.client = new KhoraClient({ baseUrl: opts.baseUrl, signer: opts.signer });
  }
}
