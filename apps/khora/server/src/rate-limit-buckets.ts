import { createRateLimiter, envRatePerMinute, type RateLimitCheck } from "./rate-limit";

export type RateLimiter = (key: string) => RateLimitCheck;

export type V2HostRateLimiters = {
  registerIp: RateLimiter;
  registerDid: RateLimiter;
  postsDid: RateLimiter;
  topicsDid: RateLimiter;
  profileDid: RateLimiter;
  inboxDid: RateLimiter;
  defaultIp: RateLimiter;
  invitePreviewIp: RateLimiter;
  invitesListDid: RateLimiter;
  roomsCreateDid: RateLimiter;
  roomsTicketMintDid: RateLimiter;
  roomsJoinDid: RateLimiter;
  roomsReadDid: RateLimiter;
  roomsRemoveDid: RateLimiter;
  relationshipsListDid: RateLimiter;
};

export function createV2HostRateLimiters(): V2HostRateLimiters {
  return {
    registerIp: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_REGISTER_PER_MIN_PER_IP, 30),
    ),
    registerDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_REGISTER_PER_MIN_PER_DID, 15),
    ),
    postsDid: createRateLimiter(envRatePerMinute(process.env.KHORA_RL_POSTS_PER_MIN_PER_DID, 120)),
    topicsDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_TOPICS_PER_MIN_PER_DID, 120),
    ),
    profileDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_PROFILE_PATCH_PER_MIN_PER_DID, 60),
    ),
    inboxDid: createRateLimiter(envRatePerMinute(process.env.KHORA_RL_INBOX_PER_MIN_PER_DID, 120)),
    defaultIp: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_DEFAULT_PER_MIN_PER_IP, 900),
    ),
    invitePreviewIp: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_INVITE_PREVIEW_PER_MIN_PER_IP, 30),
    ),
    invitesListDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_INVITES_LIST_PER_MIN_PER_DID, 60),
    ),
    roomsCreateDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_ROOMS_CREATE_PER_MIN_PER_DID, 30),
    ),
    roomsTicketMintDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_ROOMS_TICKET_PER_MIN_PER_DID, 60),
    ),
    roomsJoinDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_ROOMS_JOIN_PER_MIN_PER_DID, 30),
    ),
    roomsReadDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_ROOMS_READ_PER_MIN_PER_DID, 120),
    ),
    roomsRemoveDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_ROOMS_REMOVE_PER_MIN_PER_DID, 30),
    ),
    relationshipsListDid: createRateLimiter(
      envRatePerMinute(process.env.KHORA_RL_RELATIONSHIPS_LIST_PER_MIN_PER_DID, 60),
    ),
  };
}
