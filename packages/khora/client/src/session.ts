import type {
  KhoraPost,
  KhoraPostCreateContent,
  KhoraPostPatch,
  KhoraProfile,
  KhoraRegistrationResult,
} from "@khoralabs/khora-contracts";
import type { InboxWsHandlers } from "@khoralabs/khora-transport";
import type { KhoraClient } from "./khora-client.ts";

export type KhoraSession = {
  readonly did: string;
  readonly profileId: string;
  readonly profile: KhoraProfile;
  createPost(body: KhoraPostCreateContent): Promise<KhoraPost>;
  updatePost(id: string, patch: Omit<KhoraPostPatch, "authorSignature">): Promise<KhoraPost>;
  deletePost(id: string): Promise<void>;
  connectInbox(handlers: InboxWsHandlers): Promise<{ close(): void }>;
};

export function createKhoraSession(
  client: KhoraClient,
  registration: KhoraRegistrationResult,
): KhoraSession {
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
