import { ChatValidationError } from "./errors.ts";
import type { ThreadRoot } from "./types.ts";

export function assertThreadRoot(root: ThreadRoot): void {
  if (root.type === "channel") {
    if (!root.channelId.trim()) {
      throw new ChatValidationError("channel root requires channelId");
    }
    return;
  }
  if (!root.postId.trim()) {
    throw new ChatValidationError("post root requires postId");
  }
}

export function assertNonEmptyString(value: string, label: string): void {
  if (!value.trim()) {
    throw new ChatValidationError(`${label} is required`);
  }
}
