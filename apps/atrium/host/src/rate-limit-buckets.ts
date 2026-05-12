import { createRateLimiter, envRatePerMinute, type RateLimitCheck } from "./rate-limit.ts";

export type RateLimiter = (key: string) => RateLimitCheck;

export type HostRateLimiters = {
  registerIp: RateLimiter;
  registerDid: RateLimiter;
  postsDid: RateLimiter;
  topicsDid: RateLimiter;
  profileDid: RateLimiter;
  agentSyncDid: RateLimiter;
  inboxDid: RateLimiter;
  defaultIp: RateLimiter;
  invitePreviewIp: RateLimiter;
  invitesListDid: RateLimiter;
};

export function createHostRateLimiters(): HostRateLimiters {
  return {
    registerIp: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_REGISTER_PER_MIN_PER_IP, 30),
    ),
    registerDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_REGISTER_PER_MIN_PER_DID, 15),
    ),
    postsDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_POSTS_PER_MIN_PER_DID, 120),
    ),
    topicsDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_TOPICS_PER_MIN_PER_DID, 120),
    ),
    profileDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_PROFILE_PATCH_PER_MIN_PER_DID, 60),
    ),
    agentSyncDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_AGENT_SYNC_PER_MIN_PER_DID, 60),
    ),
    inboxDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_INBOX_PER_MIN_PER_DID, 120),
    ),
    defaultIp: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_DEFAULT_PER_MIN_PER_IP, 900),
    ),
    invitePreviewIp: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_INVITE_PREVIEW_PER_MIN_PER_IP, 30),
    ),
    invitesListDid: createRateLimiter(
      envRatePerMinute(process.env.ATRIUM_RL_INVITES_LIST_PER_MIN_PER_DID, 60),
    ),
  };
}
