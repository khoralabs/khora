import type {
  AtriumPost,
  AtriumPostCreate,
  AtriumPostPatch,
  AtriumProfile,
} from "@cfd/atrium-contracts";
import type { DidRegistrationResult } from "@cfd/swarm-host";
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
  listInbox(opts?: Omit<ListInboxParams, "did">): Promise<InboxListResult>;
  subscribeTopic(topicSlug: string): Promise<{ ok: true; topicSlug: string }>;
  unsubscribeTopic(topicSlug: string): Promise<void>;
  connectInbox(handlers: InboxWsHandlers): { close(): void };
};

export function createAtriumSession(
  client: AtriumClient,
  registration: DidRegistrationResult<AtriumProfile>,
): AtriumSession {
  const { did, profileId, profile } = registration;
  return {
    did,
    profileId,
    profile,
    createPost(body) {
      return client.createPost(did, body);
    },
    updatePost(id, patch) {
      return client.updatePost(did, id, patch);
    },
    deletePost(id) {
      return client.deletePost(did, id);
    },
    listInbox(opts) {
      return client.listInbox({ did, ...opts });
    },
    subscribeTopic(topicSlug) {
      return client.subscribeTopic(did, topicSlug);
    },
    unsubscribeTopic(topicSlug) {
      return client.unsubscribeTopic(did, topicSlug);
    },
    connectInbox(handlers) {
      return client.connectInbox(did, handlers);
    },
  };
}
