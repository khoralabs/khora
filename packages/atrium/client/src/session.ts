import type {
  AtriumPost,
  AtriumPostCreateContent,
  AtriumPostPatch,
  AtriumProfile,
  AtriumRegistrationResult,
} from "@khoralabs/atrium-contracts";
import type { InboxWsHandlers } from "@khoralabs/atrium-transport";
import type { AtriumClient } from "./atrium-client.ts";

export type AtriumSession = {
  readonly did: string;
  readonly profileId: string;
  readonly profile: AtriumProfile;
  createPost(body: AtriumPostCreateContent): Promise<AtriumPost>;
  updatePost(id: string, patch: Omit<AtriumPostPatch, "authorSignature">): Promise<AtriumPost>;
  deletePost(id: string): Promise<void>;
  connectInbox(handlers: InboxWsHandlers): Promise<{ close(): void }>;
};

export function createAtriumSession(
  client: AtriumClient,
  registration: AtriumRegistrationResult,
): AtriumSession {
  const { did, profileId, profile } = registration;
  return {
    did,
    profileId,
    profile,
    createPost(body) {
      return client.createPost(body);
    },
    updatePost(id, patch) {
      return client.updatePost(id, patch);
    },
    deletePost(id) {
      return client.deletePost(id);
    },
    connectInbox(handlers) {
      return client.connectInbox(handlers);
    },
  };
}
