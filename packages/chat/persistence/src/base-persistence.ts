import type { CreateThreadInput, ThreadRoot } from "@khoralabs/chat-core";
import { ChatNotFoundError, ChatValidationError } from "@khoralabs/chat-core";

export abstract class BaseChatPersistence {
  protected assertThreadRootExists(root: ThreadRoot): void {
    if (root.type === "channel" && !root.channelId.trim()) {
      throw new ChatValidationError("channel root requires channelId");
    }
    if (root.type === "post" && !root.postId.trim()) {
      throw new ChatValidationError("post root requires postId");
    }
  }

  protected async requireChannel(id: string) {
    const channel = await this.getChannel(id);
    if (!channel) throw new ChatNotFoundError("channel", id);
    return channel;
  }

  protected async requireThread(id: string) {
    const thread = await this.getThread(id);
    if (!thread) throw new ChatNotFoundError("thread", id);
    return thread;
  }

  protected async requirePost(id: string) {
    const post = await this.getPost(id);
    if (!post) throw new ChatNotFoundError("post", id);
    return post;
  }

  protected validateCreateThreadInput(input: CreateThreadInput): void {
    this.assertThreadRootExists(input.root);
  }

  abstract getChannel(id: string): Promise<import("@khoralabs/chat-core").Channel | null>;
  abstract getThread(id: string): Promise<import("@khoralabs/chat-core").Thread | null>;
  abstract getPost(id: string): Promise<import("@khoralabs/chat-core").Post | null>;
}
