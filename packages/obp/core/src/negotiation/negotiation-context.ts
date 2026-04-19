import type { NegotiationMessage, NegotiationToolCallRecord } from "./messages.ts";

export type PostNegotiationMessageInput = {
  authorPartyId: string;
  kind: "text" | "tool_call";
  content: string;
  toolCall?: NegotiationToolCallRecord;
};

export type WithNegotiationContextArgs = {
  forPartyId: string;
  query?: string;
  limit?: number;
};

/**
 * Stateful read/write model for a single ongoing negotiation thread.
 * All participants see the same public messages; `withContext` is the retrieval hook for RAG.
 */
export abstract class NegotiationContext {
  readonly partyIds: ReadonlyArray<string>;

  constructor(args: { partyIds: ReadonlyArray<string> }) {
    if (args.partyIds.length === 0) {
      throw new Error("NegotiationContext: partyIds must not be empty");
    }
    this.partyIds = args.partyIds;
  }

  protected assertParty(id: string): void {
    if (!this.partyIds.includes(id)) {
      throw new Error(`NegotiationContext: unknown party ${id}`);
    }
  }

  protected nextId(): string {
    return crypto.randomUUID();
  }

  protected now(): number {
    return Date.now();
  }

  abstract postMessage(input: PostNegotiationMessageInput): Promise<NegotiationMessage>;

  abstract withContext(args: WithNegotiationContextArgs): Promise<NegotiationMessage[]>;
}
