import type {
  AtriumPost,
  AtriumPostCreate,
  AtriumPostPatch,
  AtriumProfile,
  AtriumRegistrationResult,
} from "@cfd/atrium-contracts";
import type {
  AtriumClient,
  InboxListResult,
  InboxWsHandlers,
  ListInboxParams,
} from "./atrium-client.ts";

export type AtriumSession = {
  readonly did: string;
  readonly profileId: string;
  readonly profile: AtriumProfile;
  createPost(body: AtriumPostCreate): Promise<AtriumPost>;
  updatePost(id: string, patch: AtriumPostPatch): Promise<AtriumPost>;
  deletePost(id: string): Promise<void>;
  listInbox(opts?: ListInboxParams): Promise<InboxListResult>;
  subscribeTopic(topicSlug: string): Promise<{ ok: true; topicSlug: string }>;
  unsubscribeTopic(topicSlug: string): Promise<void>;
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
    listInbox(opts) {
      return client.listInbox(opts);
    },
    subscribeTopic(topicSlug) {
      return client.subscribeTopic(topicSlug);
    },
    unsubscribeTopic(topicSlug) {
      return client.unsubscribeTopic(topicSlug);
    },
    connectInbox(handlers) {
      return client.connectInbox(handlers);
    },
  };
}
