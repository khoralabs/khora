import type { PostThreadMessageInput, ThreadMessage } from "./messages.ts";

export type { PostThreadMessageInput } from "./messages.ts";

export type WithThreadContextArgs = {
  /** When retrieving context as a given participant, pass their id (must be in {@link ThreadContext.participantIds}). */
  forParticipantId: string;
  query?: string;
  limit?: number;
};

/**
 * Stateful read/write view of a single shared thread. All participants see the same public messages;
 * `withContext` is the hook for RAG (query/limit) when implemented.
 */
export abstract class ThreadContext {
  readonly participantIds: ReadonlyArray<string>;

  constructor(args: { participantIds: ReadonlyArray<string> }) {
    if (args.participantIds.length === 0) {
      throw new Error("ThreadContext: participantIds must not be empty");
    }
    this.participantIds = args.participantIds;
  }

  protected assertParticipant(id: string): void {
    if (!this.participantIds.includes(id)) {
      throw new Error(`ThreadContext: unknown participant ${id}`);
    }
  }

  protected nextId(): string {
    return crypto.randomUUID();
  }

  protected now(): number {
    return Date.now();
  }

  abstract postMessage(input: PostThreadMessageInput): Promise<ThreadMessage>;

  abstract withContext(args: WithThreadContextArgs): Promise<ThreadMessage[]>;
}
