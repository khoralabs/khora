/** DID recorded as minter for operator-minted invite tokens in host admin. */
export const KHORA_HOST_ADMIN_MINTER_DID = "did:system:host-admin";

export { generateInvitePlaintext, hashInviteToken } from "./crypto";
export {
  inviteRequiredFromEnv,
  invitesPerRegistrationFromEnv,
  parseInviteSeedTokens,
  readInvitePepper,
  validateInviteEnvConfig,
} from "./env";
export type {
  InvitePreviewResult,
  KhoraInviteAdminListRow,
  KhoraInviteListRow,
  KhoraInvitesRepo,
} from "./ports";
export { ensureKhoraInviteSchema, KHORA_INVITE_KIND, type KhoraInviteKind } from "./schema";
export { createKhoraInvitesSqliteRepo } from "./sqlite";
