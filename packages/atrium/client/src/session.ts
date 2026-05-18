import type {
  AtriumPost,
  AtriumPostCreate,
  AtriumPostPatch,
  AtriumProfile,
  AtriumRegistrationResult,
} from "@khoralabs/at2-contracts";
import type { InboxWsHandlers } from "@khoralabs/at2-transport";
import type { At2Client } from "./at2-client.ts";

export type At2Session = {
  readonly did: string;
  readonly profileId: string;
  readonly profile: AtriumProfile;
  createPost(body: AtriumPostCreate): Promise<AtriumPost>;
  updatePost(id: string, patch: AtriumPostPatch): Promise<AtriumPost>;
  deletePost(id: string): Promise<void>;
  subscribeTopic(topicSlug: string): Promise<{ ok: true; topicSlug: string }>;
  unsubscribeTopic(topicSlug: string): Promise<void>;
  connectInbox(handlers: InboxWsHandlers): Promise<{ close(): void }>;
};

export function createAt2Session(client: At2Client, registration: AtriumRegistrationResult): At2Session {
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
