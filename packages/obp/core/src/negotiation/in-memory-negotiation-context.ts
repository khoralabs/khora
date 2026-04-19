import { NegotiationContext, type PostNegotiationMessageInput, type WithNegotiationContextArgs } from "./negotiation-context.ts";
import type { NegotiationMessage } from "./messages.ts";

/**
 * Reference implementation: stores messages in memory and returns full history from {@link withContext}
 * (ignores `query` / `limit` for now).
 */
export class InMemoryNegotiationContext extends NegotiationContext {
  private readonly messages: NegotiationMessage[] = [];

  override async postMessage(input: PostNegotiationMessageInput): Promise<NegotiationMessage> {
    this.assertParty(input.authorPartyId);
    const msg: NegotiationMessage = {
      id: this.nextId(),
      ts: this.now(),
      authorPartyId: input.authorPartyId,
      kind: input.kind,
      content: input.content,
      ...(input.toolCall !== undefined ? { toolCall: input.toolCall } : {}),
    };
    this.messages.push(msg);
    return msg;
  }

  override async withContext(_args: WithNegotiationContextArgs): Promise<NegotiationMessage[]> {
    this.assertParty(_args.forPartyId);
    return [...this.messages];
  }
}
