import type { ThreadMessage } from "./messages";
import {
  type PostThreadMessageInput,
  ThreadContext,
  type WithThreadContextArgs,
} from "./thread-context";

/**
 * In-memory thread: full ordered history; {@link withContext} ignores `query` / `limit` for now.
 */
export class InMemoryThreadContext extends ThreadContext {
  private readonly messages: ThreadMessage[] = [];

  override async postMessage(input: PostThreadMessageInput): Promise<ThreadMessage> {
    this.assertParticipant(input.authorId);
    const ts = this.now();
    const msg: ThreadMessage = {
      id: this.nextId(),
      role: input.role,
      parts: input.parts,
      metadata: { authorId: input.authorId, ts },
    };
    this.messages.push(msg);
    return msg;
  }

  override async withContext(_args: WithThreadContextArgs): Promise<ThreadMessage[]> {
    this.assertParticipant(_args.forParticipantId);
    return [...this.messages];
  }
}
