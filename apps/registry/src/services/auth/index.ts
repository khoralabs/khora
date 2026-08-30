export type {
  EmailConfirmApi,
  EmailConfirmPurpose,
  EmailConfirmResult,
  EmailConfirmSession,
  EmailConfirmUser,
  SendOtpParams,
  SubscribeMarketingParams,
  VerifyOtpParams,
} from "./browser";
export {
  createRegistryEmailConfirmApi,
  createUsersAuthClient,
} from "./browser";
export {
  createRegistryAuth,
  type RegistryAuth,
  type RegistryAuthDatabase,
  type RegistryAuthOptions,
} from "./create";
export { sendOtpEmail, setCaptureOtpForTests } from "./email/ses";
export {
  getRegistryAuth,
  registryAuth,
  reloadRegistryAuth,
  revokeBetterAuthSessionsForUser,
} from "./instance";
export { createBetterAuthHttpPort } from "./ports/http";
export { createBetterAuthRegistryIdentity } from "./ports/identity";
export { initBetterAuthSchema, initRegistryAppSchema } from "./schema";
export { getRegistrySession } from "./session";
export {
  extractBetterAuthSessionCookie,
  formatBetterAuthSessionCookie,
  getBetterAuthSessionCookieHeader,
} from "./session-cookie";
export { bootstrapStaffEmails, isBootstrapStaffEmail, normalizeEmail } from "./staff";
export { verifyRegistrySession } from "./verify-session";
